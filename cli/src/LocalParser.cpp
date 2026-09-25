#include "LocalParser.hpp"
#include "ProcessRunner.hpp"
#include <nlohmann/json.hpp>
#include <iostream>
#include <filesystem>

namespace fs = std::filesystem;
using json = nlohmann::json;

namespace livephotobridge {

LocalParser::LocalParser(std::string exifToolPath)
    : m_exifToolPath(std::move(exifToolPath)) {
    if (m_exifToolPath.empty()) {
        m_exifToolPath = ProcessRunner::findExifTool();
    }
}

std::unordered_map<std::string, Metadata> LocalParser::extractMetadataBatch(
    const std::vector<std::string>& filePaths) {

    std::unordered_map<std::string, Metadata> result;
    if (filePaths.empty()) return result;

    std::vector<std::string> args = {
        "-json",
        "-FilePath",
        "-FileName",
        "-BaseName",
        "-ContentIdentifier",
        "-CreateDate",
        "-LivePhotoVideoIndex",
        "-RunTimeScale"
    };

    args.insert(args.end(), filePaths.begin(), filePaths.end());

    ProcessResult res = ProcessRunner::run(m_exifToolPath, args);
    if (!res.success() || res.stdoutData.empty()) {
        return result;
    }

    try {
        json j = json::parse(res.stdoutData);
        if (j.is_array()) {
            for (const auto& item : j) {
                std::string filePath;
                if (item.contains("FilePath") && item["FilePath"].is_string()) {
                    filePath = fs::absolute(item["FilePath"].get<std::string>()).string();
                } else if (item.contains("SourceFile") && item["SourceFile"].is_string()) {
                    filePath = fs::absolute(item["SourceFile"].get<std::string>()).string();
                }

                if (filePath.empty()) continue;

                Metadata m;
                if (item.contains("ContentIdentifier") && item["ContentIdentifier"].is_string()) {
                    m.contentIdentifier = item["ContentIdentifier"].get<std::string>();
                }
                if (item.contains("CreateDate") && item["CreateDate"].is_string()) {
                    m.createDate = item["CreateDate"].get<std::string>();
                }
                if (item.contains("LivePhotoVideoIndex")) {
                    if (item["LivePhotoVideoIndex"].is_number()) {
                        m.livePhotoVideoIndex = item["LivePhotoVideoIndex"].get<int64_t>();
                    } else if (item["LivePhotoVideoIndex"].is_string()) {
                        m.livePhotoVideoIndex = std::stoll(item["LivePhotoVideoIndex"].get<std::string>());
                    }
                }
                if (item.contains("RunTimeScale")) {
                    if (item["RunTimeScale"].is_number()) {
                        m.runTimeScale = item["RunTimeScale"].get<int64_t>();
                    } else if (item["RunTimeScale"].is_string()) {
                        m.runTimeScale = std::stoll(item["RunTimeScale"].get<std::string>());
                    }
                }

                result[filePath] = m;
            }
        }
    } catch (const std::exception& e) {
        // Parsing error fallback
    }

    return result;
}

Metadata LocalParser::extractMetadataSingle(const std::string& filePath) {
    auto batch = extractMetadataBatch({filePath});
    auto it = batch.find(fs::absolute(filePath).string());
    if (it != batch.end()) {
        return it->second;
    }
    // Also check relative path key
    if (!batch.empty()) {
        return batch.begin()->second;
    }
    return Metadata{};
}

} // namespace livephotobridge
