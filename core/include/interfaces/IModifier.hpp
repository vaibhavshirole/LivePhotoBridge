#pragma once

#include <string>
#include <cstdint>

namespace livephotobridge {

class IModifier {
public:
    virtual ~IModifier() = default;

    // Injects XMP metadata into the clean photo file
    // videoOffset: size of companion video in bytes (distance from EOF backwards)
    // presentationTimestampUs: presentation timestamp in microseconds
    virtual bool addXmpData(const std::string& targetPhotoPath,
                            uint64_t videoOffset,
                            int64_t presentationTimestampUs) = 0;
};

} // namespace livephotobridge
