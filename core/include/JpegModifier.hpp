#pragma once

#include "interfaces/IModifier.hpp"
#include <vector>
#include <string>
#include <cstdint>

namespace livephotobridge {

class JpegModifier : public IModifier {
public:
    JpegModifier() = default;
    ~JpegModifier() override = default;

    // File-based implementation of IModifier
    bool addXmpData(const std::string& targetPhotoPath,
                    uint64_t videoOffset,
                    int64_t presentationTimestampUs,
                    bool isStarred = false) override;

    // In-memory buffer manipulation (used by both native CLI and WASM)
    static bool injectXmp(std::vector<uint8_t>& jpegBytes,
                          uint64_t videoOffset,
                          int64_t presentationTimestampUs,
                          bool isStarred = false);

    // Build the standard Google Camera XMP XML packet
    static std::string buildGCameraXmp(uint64_t videoOffset,
                                       int64_t presentationTimestampUs,
                                       bool isStarred = false);
};

} // namespace livephotobridge
