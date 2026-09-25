#pragma once

#include "Types.hpp"
#include "interfaces/IParser.hpp"
#include "interfaces/IModifier.hpp"
#include "interfaces/IConverter.hpp"
#include "interfaces/ITransporter.hpp"
#include <memory>
#include <vector>
#include <string>
#include <unordered_map>

namespace livephotobridge {

class PhotoMuxer {
public:
    PhotoMuxer(std::shared_ptr<IParser> parser,
               std::shared_ptr<IModifier> jpegModifier,
               std::shared_ptr<IModifier> heicModifier,
               std::shared_ptr<ITransporter> transporter = nullptr,
               std::shared_ptr<IConverter> converter = nullptr);

    virtual ~PhotoMuxer() = default;

    // Callbacks for UI / Terminal progress reporting
    void setProgressCallback(ProgressCallback cb) { m_progressCb = std::move(cb); }
    void setLogCallback(LogCallback cb) { m_logCb = std::move(cb); }

    // Execute the complete two-phase low-memory pipeline
    PipelineResult process(const PipelineOptions& options);

    // Phase 1: 3-Tier Pairing algorithm (UUID -> Date+Stem -> Stem)
    std::vector<LivePhotoPair> matchPairs(
        const std::vector<FileItem>& files,
        const std::unordered_map<std::string, Metadata>& metadataMap);

    // Phase 2: Mux a single pair (Tag first, append second)
    bool muxPair(const LivePhotoPair& pair,
                 const std::string& outputDir,
                 const PipelineOptions& options,
                 std::string& outPath);

    // Helpers
    static FileItem inspectFile(const std::string& path);
    static std::vector<FileItem> scanDirectory(const std::string& dirPath, bool recurse);
    static bool appendBinaryFile(const std::string& targetPath, const std::string& sourceToAppend);
    static std::string getDatePart(const std::string& createDate);

private:
    PipelineResult processDirectory(const PipelineOptions& options);
    PipelineResult processIndividualFiles(const PipelineOptions& options);

    void emitProgress(const std::string& msg, float percentage);
    void emitLog(const std::string& msg);

    std::shared_ptr<IParser> m_parser;
    std::shared_ptr<IModifier> m_jpegModifier;
    std::shared_ptr<IModifier> m_heicModifier;
    std::shared_ptr<ITransporter> m_transporter;
    std::shared_ptr<IConverter> m_converter;

    ProgressCallback m_progressCb;
    LogCallback m_logCb;
};

} // namespace livephotobridge
