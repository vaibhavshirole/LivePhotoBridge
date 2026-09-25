#pragma once

#include <string>
#include <vector>

namespace livephotobridge {

struct ProcessResult {
    int exitCode = -1;
    std::string stdoutData;
    std::string stderrData;
    bool success() const { return exitCode == 0; }
};

class ProcessRunner {
public:
    // Run command with argument list (safe against shell injection)
    static ProcessResult run(const std::string& executable, const std::vector<std::string>& args);

    // Locate exiftool: checks bundled path first, then searches system PATH
    static std::string findExifTool();

    // Locate sips on macOS
    static std::string findSips();
};

} // namespace livephotobridge
