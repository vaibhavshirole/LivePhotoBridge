#include "JpegModifier.hpp"
#include <fstream>
#include <sstream>
#include <iostream>

namespace livephotobridge {

std::string JpegModifier::buildGCameraXmp(uint64_t videoOffset, int64_t presentationTimestampUs) {
    std::ostringstream ss;
    ss << "<?xpacket begin='\xEF\xBB\xBF' id='W5M0MpCehiHzreSzNTczkc9d'?>\n"
       << "<x:xmpmeta xmlns:x='adobe:ns:meta/'>\n"
       << "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>\n"
       << " <rdf:Description rdf:about='' xmlns:GCamera='http://ns.google.com/photos/1.0/camera/'>\n"
       << "  <GCamera:MicroVideo>1</GCamera:MicroVideo>\n"
       << "  <GCamera:MicroVideoOffset>" << videoOffset << "</GCamera:MicroVideoOffset>\n"
       << "  <GCamera:MicroVideoPresentationTimestampUs>" << presentationTimestampUs << "</GCamera:MicroVideoPresentationTimestampUs>\n"
       << "  <GCamera:MicroVideoVersion>1</GCamera:MicroVideoVersion>\n"
       << "  <GCamera:MotionPhoto>1</GCamera:MotionPhoto>\n"
       << "  <GCamera:MotionPhotoPresentationTimestampUs>" << presentationTimestampUs << "</GCamera:MotionPhotoPresentationTimestampUs>\n"
       << "  <GCamera:MotionPhotoVersion>1</GCamera:MotionPhotoVersion>\n"
       << " </rdf:Description>\n"
       << "</rdf:RDF>\n"
       << "</x:xmpmeta>\n"
       << "<?xpacket end='w'?>";
    return ss.str();
}

bool JpegModifier::injectXmp(std::vector<uint8_t>& jpegBytes,
                             uint64_t videoOffset,
                             int64_t presentationTimestampUs) {
    // Validate JPEG Start of Image (SOI): 0xFF, 0xD8
    if (jpegBytes.size() < 4 || jpegBytes[0] != 0xFF || jpegBytes[1] != 0xD8) {
        return false;
    }

    std::string xmpXml = buildGCameraXmp(videoOffset, presentationTimestampUs);
    const std::string xmpHeader = "http://ns.adobe.com/xap/1.0/\0";
    
    // APP1 segment: 0xFF, 0xE1, length (2 bytes), namespace header (29 bytes), XML
    // Length value in JPEG marker includes the 2 bytes of the length field itself
    size_t payloadSize = 29 + xmpXml.size(); // 28 chars + null terminator = 29 bytes
    size_t app1Length = 2 + payloadSize;
    if (app1Length > 65535) {
        return false; // Exceeds 16-bit JPEG marker segment size
    }

    std::vector<uint8_t> app1Segment;
    app1Segment.reserve(4 + payloadSize);
    app1Segment.push_back(0xFF);
    app1Segment.push_back(0xE1);
    app1Segment.push_back(static_cast<uint8_t>((app1Length >> 8) & 0xFF));
    app1Segment.push_back(static_cast<uint8_t>(app1Length & 0xFF));
    
    // Copy namespace header including terminating null
    app1Segment.insert(app1Segment.end(), xmpHeader.data(), xmpHeader.data() + 29);
    // Copy XML body
    app1Segment.insert(app1Segment.end(), xmpXml.begin(), xmpXml.end());

    // Insert APP1 directly after SOI (at index 2)
    jpegBytes.insert(jpegBytes.begin() + 2, app1Segment.begin(), app1Segment.end());
    return true;
}

bool JpegModifier::addXmpData(const std::string& targetPhotoPath,
                              uint64_t videoOffset,
                              int64_t presentationTimestampUs) {
    std::ifstream inFile(targetPhotoPath, std::ios::binary | std::ios::ate);
    if (!inFile.is_open()) {
        return false;
    }

    std::streamsize fileSize = inFile.tellg();
    inFile.seekg(0, std::ios::beg);

    std::vector<uint8_t> buffer(static_cast<size_t>(fileSize));
    if (!inFile.read(reinterpret_cast<char*>(buffer.data()), fileSize)) {
        return false;
    }
    inFile.close();

    if (!injectXmp(buffer, videoOffset, presentationTimestampUs)) {
        return false;
    }

    std::ofstream outFile(targetPhotoPath, std::ios::binary | std::ios::trunc);
    if (!outFile.is_open()) {
        return false;
    }

    outFile.write(reinterpret_cast<const char*>(buffer.data()), buffer.size());
    return outFile.good();
}

} // namespace livephotobridge
