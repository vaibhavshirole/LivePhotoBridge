#pragma once

#include <string>

namespace livephotobridge {

class ITransporter {
public:
    virtual ~ITransporter() = default;

    // Transports or sends a finished file (e.g. local move, HTTP stream, WebRTC)
    virtual bool sendFile(const std::string& filePath, const std::string& destination) = 0;
};

} // namespace livephotobridge
