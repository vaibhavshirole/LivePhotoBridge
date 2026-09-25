#pragma once

#include "interfaces/IConverter.hpp"
#include <string>

namespace livephotobridge {

class LocalConverter : public IConverter {
public:
    explicit LocalConverter(std::string sipsPath = "");
    ~LocalConverter() override = default;

    std::string convertHeicToJpg(const std::string& inputHeicPath,
                                 const std::string& outputJpgPath) override;

private:
    std::string m_sipsPath;
};

} // namespace livephotobridge
