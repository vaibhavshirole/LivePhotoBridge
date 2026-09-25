#include "LocalConverter.hpp"
#include "ProcessRunner.hpp"
#include <sys/stat.h>
#include <utime.h>
#include <filesystem>
#include <iostream>

namespace fs = std::filesystem;

namespace livephotobridge {

LocalConverter::LocalConverter(std::string sipsPath)
    : m_sipsPath(std::move(sipsPath)) {
    if (m_sipsPath.empty()) {
        m_sipsPath = ProcessRunner::findSips();
    }
}

std::string LocalConverter::convertHeicToJpg(const std::string& inputHeicPath,
                                             const std::string& outputJpgPath) {
    if (!fs::exists(inputHeicPath)) {
        return "";
    }

    std::vector<std::string> args = {
        "-s", "format", "jpeg",
        "-s", "formatOptions", "100",
        inputHeicPath,
        "--out", outputJpgPath
    };

    ProcessResult res = ProcessRunner::run(m_sipsPath, args);
    if (!res.success() || !fs::exists(outputJpgPath)) {
        return "";
    }

    // Preserve original timestamp
    struct stat st;
    if (stat(inputHeicPath.c_str(), &st) == 0) {
        struct utimbuf times;
        times.actime = st.st_atime;
        times.modtime = st.st_mtime;
        utime(outputJpgPath.c_str(), &times);
    }

    return outputJpgPath;
}

} // namespace livephotobridge
