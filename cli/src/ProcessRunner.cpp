#include "ProcessRunner.hpp"
#include <unistd.h>
#include <sys/wait.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <array>
#include <iostream>
#include <filesystem>

namespace fs = std::filesystem;

namespace livephotobridge {

ProcessResult ProcessRunner::run(const std::string& executable, const std::vector<std::string>& args) {
    ProcessResult result;

    int stdoutPipe[2];
    int stderrPipe[2];

    if (pipe(stdoutPipe) != 0 || pipe(stderrPipe) != 0) {
        result.stderrData = "Failed to create pipes";
        return result;
    }

    pid_t pid = fork();
    if (pid < 0) {
        result.stderrData = "Failed to fork process";
        close(stdoutPipe[0]); close(stdoutPipe[1]);
        close(stderrPipe[0]); close(stderrPipe[1]);
        return result;
    }

    if (pid == 0) {
        // Child process
        close(stdoutPipe[0]);
        close(stderrPipe[0]);

        dup2(stdoutPipe[1], STDOUT_FILENO);
        dup2(stderrPipe[1], STDERR_FILENO);

        close(stdoutPipe[1]);
        close(stderrPipe[1]);

        std::vector<char*> cArgs;
        cArgs.push_back(const_cast<char*>(executable.c_str()));
        for (const auto& a : args) {
            cArgs.push_back(const_cast<char*>(a.c_str()));
        }
        cArgs.push_back(nullptr);

        execvp(executable.c_str(), cArgs.data());
        _exit(127);
    }

    // Parent process
    close(stdoutPipe[1]);
    close(stderrPipe[1]);

    std::array<char, 4096> buffer;
    ssize_t bytesRead = 0;

    // Read stdout
    while ((bytesRead = read(stdoutPipe[0], buffer.data(), buffer.size())) > 0) {
        result.stdoutData.append(buffer.data(), bytesRead);
    }
    close(stdoutPipe[0]);

    // Read stderr
    while ((bytesRead = read(stderrPipe[0], buffer.data(), buffer.size())) > 0) {
        result.stderrData.append(buffer.data(), bytesRead);
    }
    close(stderrPipe[0]);

    int status = 0;
    waitpid(pid, &status, 0);

    if (WIFEXITED(status)) {
        result.exitCode = WEXITSTATUS(status);
    } else {
        result.exitCode = -1;
    }

    return result;
}

std::string ProcessRunner::findExifTool() {
    // 1. Check relative to current working directory or binary directory
    std::vector<std::string> candidates = {
        "libs/exiftool/exiftool",
        "../libs/exiftool/exiftool",
        "../../libs/exiftool/exiftool",
        "photobridge/exiftool/exiftool",
        "../photobridge/exiftool/exiftool",
        "/opt/homebrew/bin/exiftool",
        "/usr/local/bin/exiftool",
        "/usr/bin/exiftool"
    };

    for (const auto& path : candidates) {
        if (fs::exists(path) && fs::is_regular_file(path)) {
            return fs::absolute(path).string();
        }
    }

    // 2. Search PATH environment variable
    const char* pathEnv = std::getenv("PATH");
    if (pathEnv) {
        std::string pathStr = pathEnv;
        size_t start = 0;
        size_t end = 0;
        while ((end = pathStr.find(':', start)) != std::string::npos) {
            std::string dir = pathStr.substr(start, end - start);
            fs::path p = fs::path(dir) / "exiftool";
            if (fs::exists(p) && fs::is_regular_file(p)) {
                return p.string();
            }
            start = end + 1;
        }
        if (start < pathStr.length()) {
            fs::path p = fs::path(pathStr.substr(start)) / "exiftool";
            if (fs::exists(p) && fs::is_regular_file(p)) {
                return p.string();
            }
        }
    }

    return "exiftool"; // Fallback to bare command
}

std::string ProcessRunner::findSips() {
    std::vector<std::string> candidates = {
        "/usr/bin/sips",
        "/opt/homebrew/bin/sips",
        "/usr/local/bin/sips"
    };

    for (const auto& path : candidates) {
        if (fs::exists(path) && fs::is_regular_file(path)) {
            return path;
        }
    }
    return "sips";
}

} // namespace livephotobridge
