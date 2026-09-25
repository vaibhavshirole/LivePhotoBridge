#pragma once

#include "interfaces/ITransporter.hpp"
#include <string>

namespace livephotobridge {

class LocalTransporter : public ITransporter {
public:
    LocalTransporter() = default;
    ~LocalTransporter() override = default;

    bool sendFile(const std::string& filePath, const std::string& destination) override;
};

} // namespace livephotobridge
