#pragma once

#include <string>

namespace livephotobridge {

class IConverter {
public:
    virtual ~IConverter() = default;

    // Converts input HEIC file to JPEG
    // Returns output JPEG path on success, or empty string on failure
    virtual std::string convertHeicToJpg(const std::string& inputHeicPath,
                                         const std::string& outputJpgPath) = 0;
};

} // namespace livephotobridge
