#pragma once

#include "Types.hpp"
#include <string>
#include <vector>
#include <unordered_map>

namespace livephotobridge {

class IParser {
public:
    virtual ~IParser() = default;

    // Batch extract metadata for a list of file paths (Header-only reads)
    virtual std::unordered_map<std::string, Metadata> extractMetadataBatch(
        const std::vector<std::string>& filePaths) = 0;

    // Single file metadata extraction
    virtual Metadata extractMetadataSingle(const std::string& filePath) = 0;
};

} // namespace livephotobridge
