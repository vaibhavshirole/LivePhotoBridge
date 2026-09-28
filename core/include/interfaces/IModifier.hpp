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
    // isStarred: if true, writes Rating = 5, Label = Favorite, and dc:Subject Favorite tags
    virtual bool addXmpData(const std::string& targetPhotoPath,
                            uint64_t videoOffset,
                            int64_t presentationTimestampUs,
                            bool isStarred = false) = 0;
};

} // namespace livephotobridge
