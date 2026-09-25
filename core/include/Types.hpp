#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <functional>

namespace livephotobridge {

enum class FileType {
    Photo,
    Video,
    Unknown
};

enum class FileFormat {
    JPEG,
    HEIC,
    MOV,
    MP4,
    Unknown
};

struct FileItem {
    std::string path;
    std::string filename;
    std::string stem;
    std::string extension;
    FileType type = FileType::Unknown;
    FileFormat format = FileFormat::Unknown;
    uint64_t fileSize = 0;
};

struct Metadata {
    std::string contentIdentifier;
    std::string createDate;
    int64_t livePhotoVideoIndex = 0;
    int64_t runTimeScale = 1;

    int64_t getPresentationTimestampUs() const {
        if (livePhotoVideoIndex > 0) {
            int64_t scale = (runTimeScale > 0) ? runTimeScale : 1;
            return (livePhotoVideoIndex * 1000000) / scale;
        }
        return 750000; // Default 0.75s midpoint fallback
    }
};

struct LivePhotoPair {
    FileItem photo;
    FileItem video;
    Metadata metadata;
    bool isPair = false;

    bool isValid() const {
        return isPair && !photo.path.empty() && !video.path.empty();
    }
};

struct PipelineOptions {
    std::string inputDir;
    std::string singlePhoto;
    std::string singleVideo;
    std::string outputDir;
    bool recurse = false;
    bool convertHeicToJpg = false;
    bool deleteOriginals = false;
    bool verbose = false;
    bool benchmark = false;
    bool jsonOutput = false;
    size_t batchSize = 5;
};

struct PipelineResult {
    size_t pairsFound = 0;
    size_t pairsProcessed = 0;
    size_t pairsSucceeded = 0;
    size_t unmatchedPhotosMoved = 0;
    size_t unmatchedVideosMoved = 0;
    double totalTimeMs = 0.0;
    std::vector<std::string> outputFiles;
    std::vector<std::string> errors;
};

using ProgressCallback = std::function<void(const std::string& message, float percentage)>;
using LogCallback = std::function<void(const std::string& message)>;

} // namespace livephotobridge
