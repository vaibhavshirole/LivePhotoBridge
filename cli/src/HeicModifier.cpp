#include "HeicModifier.hpp"
#include "ProcessRunner.hpp"
#include <fstream>
#include <filesystem>
#include <iostream>

namespace fs = std::filesystem;

namespace livephotobridge {

namespace {
const char* EMBEDDED_GCAMERA_CONFIG = R"(
%Image::ExifTool::UserDefined = (
    'Image::ExifTool::XMP::Main' => {
        GCamera => {
            SubDirectory => {
                TagTable => 'Image::ExifTool::UserDefined::GCamera',
            },
        },
        Container => {
            SubDirectory => {
                TagTable => 'Image::ExifTool::UserDefined::Container',
            },
        },
        Item => {
            SubDirectory => {
                TagTable => 'Image::ExifTool::UserDefined::Item',
            },
        },
    },
);

%Image::ExifTool::UserDefined::GCamera = (
    GROUPS => { 0 => 'XMP', 1 => 'XMP-GCamera', 2 => 'Image' },
    NAMESPACE => { 'GCamera' => 'http://ns.google.com/photos/1.0/camera/' },
    WRITABLE => 'string',
    MicroVideo => {},
    MicroVideoVersion => {},
    MicroVideoOffset => {},
    MicroVideoPresentationTimestampUs => {},
    MotionPhoto => {},
    MotionPhotoVersion => {},
    MotionPhotoPresentationTimestampUs => {},
);

%Image::ExifTool::UserDefined::Container = (
    GROUPS => { 0 => 'XMP', 1 => 'XMP-Container', 2 => 'Image' },
    NAMESPACE => { 'Container' => 'http://ns.google.com/photos/1.0/container/' },
    WRITABLE => 'string',
    Directory => {
        List => 'Seq',
        SubDirectory => {
            TagTable => 'Image::ExifTool::UserDefined::XMP::Item',
        },
    },
);

%Image::ExifTool::UserDefined::Item = (
    GROUPS => { 0 => 'XMP', 1 => 'XMP-Item', 2 => 'Image' },
    NAMESPACE => { 'Item' => 'http://ns.google.com/photos/1.0/container/item/' },
    WRITABLE => 'string',
    Mime => {},
    Semantic => {},
    Length => {},
    Padding => {},
);

1;
)";
} // anonymous namespace

HeicModifier::HeicModifier(std::string exifToolPath, std::string configPath)
    : m_exifToolPath(std::move(exifToolPath))
    , m_configPath(std::move(configPath)) {
    if (m_exifToolPath.empty()) {
        m_exifToolPath = ProcessRunner::findExifTool();
    }
}

std::string HeicModifier::ensureConfigFile() {
    if (!m_configPath.empty() && fs::exists(m_configPath)) {
        return m_configPath;
    }

    // Check candidate paths in repo
    std::vector<std::string> candidates = {
        "libs/exiftool/google_camera.config",
        "../libs/exiftool/google_camera.config",
        "../../libs/exiftool/google_camera.config"
    };

    for (const auto& c : candidates) {
        if (fs::exists(c)) {
            m_configPath = fs::absolute(c).string();
            return m_configPath;
        }
    }

    // Write embedded config to temp directory
    fs::path tempConfig = fs::temp_directory_path() / ".livephotobridge_gcamera.config";
    if (!fs::exists(tempConfig)) {
        std::ofstream out(tempConfig);
        out << EMBEDDED_GCAMERA_CONFIG;
        out.close();
    }
    m_configPath = tempConfig.string();
    return m_configPath;
}

bool HeicModifier::addXmpData(const std::string& targetPhotoPath,
                              uint64_t videoOffset,
                              int64_t presentationTimestampUs,
                              bool isStarred) {
    std::string config = ensureConfigFile();

    std::vector<std::string> args = {
        "-config", config,
        "-overwrite_original",
        "-m",
        "-q",
        "-XMP-GCamera:MicroVideo=1",
        "-XMP-GCamera:MicroVideoVersion=1",
        "-XMP-GCamera:MicroVideoOffset=" + std::to_string(videoOffset),
        "-XMP-GCamera:MicroVideoPresentationTimestampUs=" + std::to_string(presentationTimestampUs),
        "-XMP-GCamera:MotionPhoto=1",
        "-XMP-GCamera:MotionPhotoVersion=1",
        "-XMP-GCamera:MotionPhotoPresentationTimestampUs=" + std::to_string(presentationTimestampUs)
    };

    if (isStarred) {
        args.push_back("-XMP-xmp:Rating=5");
        args.push_back("-XMP-xmp:Label=Favorite");
        args.push_back("-XMP-dc:Subject=Favorite");
        args.push_back("-XMP-dc:Subject=Starred");
    }

    args.push_back(targetPhotoPath);

    ProcessResult res = ProcessRunner::run(m_exifToolPath, args);
    return res.success();
}

} // namespace livephotobridge
