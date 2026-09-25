#include "LocalTransporter.hpp"
#include <filesystem>
#include <iostream>

namespace fs = std::filesystem;

namespace livephotobridge {

bool LocalTransporter::sendFile(const std::string& filePath, const std::string& destination) {
    if (!fs::exists(filePath)) {
        return false;
    }
    if (destination.empty()) {
        return true;
    }

    fs::path src(filePath);
    fs::path dstDir(destination);

    std::error_code ec;
    fs::create_directories(dstDir, ec);

    fs::path target = dstDir / src.filename();
    if (fs::absolute(src) == fs::absolute(target)) {
        return true;
    }

    fs::copy_file(src, target, fs::copy_options::overwrite_existing, ec);
    return !ec;
}

} // namespace livephotobridge
