#include "PhotoMuxer.hpp"
#include "JpegModifier.hpp"
#include <cassert>
#include <iostream>
#include <vector>

using namespace livephotobridge;

void testJpegModifierXmpConstruction() {
    std::cout << "[TEST] JpegModifier XMP generation..." << std::endl;
    std::string xmp = JpegModifier::buildGCameraXmp(4236630, 8595185);
    assert(xmp.find("<GCamera:MicroVideo>1</GCamera:MicroVideo>") != std::string::npos);
    assert(xmp.find("<GCamera:MicroVideoOffset>4236630</GCamera:MicroVideoOffset>") != std::string::npos);
    assert(xmp.find("<GCamera:MicroVideoPresentationTimestampUs>8595185</GCamera:MicroVideoPresentationTimestampUs>") != std::string::npos);
    assert(xmp.find("<GCamera:MotionPhoto>1</GCamera:MotionPhoto>") != std::string::npos);
    assert(xmp.find("<GCamera:MotionPhotoPresentationTimestampUs>8595185</GCamera:MotionPhotoPresentationTimestampUs>") != std::string::npos);
    std::cout << "  ✓ Passed" << std::endl;
}

void testJpegModifierApp1Injection() {
    std::cout << "[TEST] JpegModifier APP1 injection into raw bytes..." << std::endl;
    // Minimal valid JPEG header: SOI (0xFF, 0xD8), DQT marker (0xFF, 0xDB)
    std::vector<uint8_t> jpegBytes = { 0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x04, 0x00, 0x00 };

    bool ok = JpegModifier::injectXmp(jpegBytes, 500000, 750000);
    assert(ok);
    assert(jpegBytes.size() > 100);
    // Byte 0, 1: SOI (0xFF, 0xD8)
    assert(jpegBytes[0] == 0xFF);
    assert(jpegBytes[1] == 0xD8);
    // Byte 2, 3: APP1 (0xFF, 0xE1)
    assert(jpegBytes[2] == 0xFF);
    assert(jpegBytes[3] == 0xE1);

    // Verify namespace header "http://ns.adobe.com/xap/1.0/\0" starts at index 6
    std::string nsHeader(reinterpret_cast<char*>(&jpegBytes[6]), 28);
    assert(nsHeader == "http://ns.adobe.com/xap/1.0/");
    assert(jpegBytes[6 + 28] == '\0');
    std::cout << "  ✓ Passed" << std::endl;
}

void testPairMatcherTier1Uuid() {
    std::cout << "[TEST] Pair matching Tier 1 (Apple ContentIdentifier UUID)..." << std::endl;
    PhotoMuxer muxer(nullptr, nullptr, nullptr);

    FileItem photo1;
    photo1.path = "/photos/IMG_0001.HEIC";
    photo1.stem = "IMG_0001";
    photo1.type = FileType::Photo;

    FileItem video1;
    video1.path = "/photos/IMG_0001.MOV";
    video1.stem = "IMG_0001";
    video1.type = FileType::Video;

    FileItem photo2;
    photo2.path = "/photos/subfolder/IMG_0001.HEIC"; // Duplicate name in subfolder!
    photo2.stem = "IMG_0001";
    photo2.type = FileType::Photo;

    FileItem video2;
    video2.path = "/photos/subfolder/IMG_0001.MOV";
    video2.stem = "IMG_0001";
    video2.type = FileType::Video;

    std::vector<FileItem> files = { photo1, video1, photo2, video2 };

    std::unordered_map<std::string, Metadata> metaMap;
    metaMap[photo1.path] = Metadata{"UUID-A", "2024:01:01 10:00:00", 0, 1};
    metaMap[video1.path] = Metadata{"UUID-A", "2024:01:01 10:00:00", 0, 1};
    metaMap[photo2.path] = Metadata{"UUID-B", "2024:06:01 12:00:00", 0, 1};
    metaMap[video2.path] = Metadata{"UUID-B", "2024:06:01 12:00:00", 0, 1};

    auto pairs = muxer.matchPairs(files, metaMap);
    assert(pairs.size() == 2);
    assert(pairs[0].isValid());
    assert(pairs[1].isValid());
    assert(pairs[0].metadata.contentIdentifier == "UUID-A");
    assert(pairs[1].metadata.contentIdentifier == "UUID-B");
    std::cout << "  ✓ Passed (Nested folder duplicate filenames resolved cleanly via UUID)" << std::endl;
}

void testPairMatcherTier2DateStemFallback() {
    std::cout << "[TEST] Pair matching Tier 2 (CreateDate + Stem pattern fallback)..." << std::endl;
    PhotoMuxer muxer(nullptr, nullptr, nullptr);

    FileItem photo;
    photo.path = "/photos/IMG_2020.JPG";
    photo.stem = "IMG_2020";
    photo.type = FileType::Photo;

    FileItem video;
    video.path = "/photos/IMG_2020.MOV";
    video.stem = "IMG_2020";
    video.type = FileType::Video;

    std::vector<FileItem> files = { photo, video };

    // Missing UUID, but identical create date
    std::unordered_map<std::string, Metadata> metaMap;
    metaMap[photo.path] = Metadata{"", "2023:08:15 14:30:22", 0, 1};
    metaMap[video.path] = Metadata{"", "2023:08:15 14:30:22", 0, 1};

    auto pairs = muxer.matchPairs(files, metaMap);
    assert(pairs.size() == 1);
    assert(pairs[0].isValid());
    assert(pairs[0].photo.path == photo.path);
    assert(pairs[0].video.path == video.path);
    std::cout << "  ✓ Passed" << std::endl;
}

int main() {
    std::cout << "\n=== Running LivePhotoBridge Core Tests ===\n" << std::endl;
    testJpegModifierXmpConstruction();
    testJpegModifierApp1Injection();
    testPairMatcherTier1Uuid();
    testPairMatcherTier2DateStemFallback();
    std::cout << "\n=== ALL CORE TESTS PASSED! ===\n" << std::endl;
    return 0;
}
