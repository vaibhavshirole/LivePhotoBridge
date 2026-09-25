#pragma once

#include "interfaces/IParser.hpp"
#include <string>
#include <vector>
#include <unordered_map>

namespace livephotobridge {

class LocalParser : public IParser {
public:
    explicit LocalParser(std::string exifToolPath = "");
    ~LocalParser() override = default;

    std::unordered_map<std::string, Metadata> extractMetadataBatch(
        const std::vector<std::string>& filePaths) override;

    Metadata extractMetadataSingle(const std::string& filePath) override;

private:
    std::string m_exifToolPath;
};

} // namespace livephotobridge
