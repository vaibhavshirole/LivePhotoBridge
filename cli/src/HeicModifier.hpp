#pragma once

#include "interfaces/IModifier.hpp"
#include <string>
#include <cstdint>

namespace livephotobridge {

class HeicModifier : public IModifier {
public:
    explicit HeicModifier(std::string exifToolPath = "", std::string configPath = "");
    ~HeicModifier() override = default;

    bool addXmpData(const std::string& targetPhotoPath,
                    uint64_t videoOffset,
                    int64_t presentationTimestampUs,
                    bool isStarred = false) override;

private:
    std::string ensureConfigFile();

    std::string m_exifToolPath;
    std::string m_configPath;
};

} // namespace livephotobridge
