#include "PhotoMuxer.hpp"
#include <filesystem>
#include <fstream>
#include <regex>
#include <algorithm>
#include <chrono>
#include <iostream>
#include <unordered_set>

namespace fs = std::filesystem;

namespace livephotobridge {

namespace {

bool isIgnoredSystemPath(const fs::path& p) {
    std::string filename = p.filename().string();
    if (filename.empty()) return true;
    if (filename.starts_with(".") || filename.starts_with("._")) return true;

    std::string lowerName = filename;
    std::transform(lowerName.begin(), lowerName.end(), lowerName.begin(), ::tolower);
    if (lowerName == "thumbs.db" || lowerName == "desktop.ini" || lowerName == ".ds_store") {
        return true;
    }

    // Check directory components for hidden folders or __MACOSX
    for (const auto& part : p) {
        std::string partStr = part.string();
        if (partStr == "." || partStr == "..") continue;
        if (partStr.starts_with(".") || partStr == "__MACOSX") {
            return true;
        }
    }
    return false;
}

bool isSupportedMediaExtension(const std::string& extLower) {
    static const std::unordered_set<std::string> s_mediaExts = {
        // Live Photo eligible
        "jpg", "jpeg", "heic", "heif",
        // Live Video eligible
        "mov", "mp4",
        // Other photos / images
        "png", "webp", "gif", "bmp", "tiff", "tif", "avif",
        "raw", "dng", "cr2", "nef", "arw", "rw2", "orf", "pef",
        // Other videos
        "m4v", "webm", "mkv", "avi", "3gp", "ts"
    };
    std::string ext = (!extLower.empty() && extLower[0] == '.') ? extLower.substr(1) : extLower;
    return s_mediaExts.find(ext) != s_mediaExts.end();
}

} // anonymous namespace

PhotoMuxer::PhotoMuxer(std::shared_ptr<IParser> parser,
                       std::shared_ptr<IModifier> jpegModifier,
                       std::shared_ptr<IModifier> heicModifier,
                       std::shared_ptr<ITransporter> transporter,
                       std::shared_ptr<IConverter> converter)
    : m_parser(std::move(parser))
    , m_jpegModifier(std::move(jpegModifier))
    , m_heicModifier(std::move(heicModifier))
    , m_transporter(std::move(transporter))
    , m_converter(std::move(converter)) {}

void PhotoMuxer::emitProgress(const std::string& msg, float percentage) {
    if (m_progressCb) {
        m_progressCb(msg, percentage);
    }
}

void PhotoMuxer::emitLog(const std::string& msg) {
    if (m_logCb) {
        m_logCb(msg);
    }
}

std::string PhotoMuxer::getDatePart(const std::string& createDate) {
    if (createDate.empty()) return "";
    size_t spacePos = createDate.find(' ');
    if (spacePos != std::string::npos) {
        return createDate.substr(0, spacePos);
    }
    return createDate;
}

FileItem PhotoMuxer::inspectFile(const std::string& pathStr) {
    FileItem item;
    fs::path p(pathStr);
    if (isIgnoredSystemPath(p)) {
        item.type = FileType::Unknown;
        item.format = FileFormat::Unknown;
        return item;
    }

    item.path = fs::absolute(p).string();
    item.filename = p.filename().string();
    item.stem = p.stem().string();
    item.extension = p.extension().string();

    std::string extLower = item.extension;
    std::transform(extLower.begin(), extLower.end(), extLower.begin(), ::tolower);

    if (!isSupportedMediaExtension(extLower)) {
        item.type = FileType::Unknown;
        item.format = FileFormat::Unknown;
        return item;
    }

    // Check if filename stem contains _starred (case-insensitive)
    std::string stemLower = item.stem;
    std::transform(stemLower.begin(), stemLower.end(), stemLower.begin(), ::tolower);
    item.isStarred = (stemLower.find("_starred") != std::string::npos);

    std::string stemUpper = item.stem;
    std::transform(stemUpper.begin(), stemUpper.end(), stemUpper.begin(), ::toupper);
    bool isExistingMP = stemUpper.ends_with(".MP") || stemUpper.ends_with("_MP") ||
                        stemUpper.find(".MP.") != std::string::npos || stemUpper.find("_MP.") != std::string::npos;
    if (isExistingMP) {
        // Existing motion photos pass through without re-muxing
        item.type = FileType::Media;
        item.format = FileFormat::Other;
    } else if (extLower == ".jpg" || extLower == ".jpeg") {
        item.type = FileType::Photo;
        item.format = FileFormat::JPEG;
    } else if (extLower == ".heic" || extLower == ".heif") {
        item.type = FileType::Photo;
        item.format = FileFormat::HEIC;
    } else if (extLower == ".mov") {
        item.type = FileType::Video;
        item.format = FileFormat::MOV;
    } else if (extLower == ".mp4") {
        item.type = FileType::Video;
        item.format = FileFormat::MP4;
    } else if (extLower == ".png") {
        item.type = FileType::Media;
        item.format = FileFormat::PNG;
    } else if (extLower == ".webp") {
        item.type = FileType::Media;
        item.format = FileFormat::WEBP;
    } else if (extLower == ".gif") {
        item.type = FileType::Media;
        item.format = FileFormat::GIF;
    } else {
        item.type = FileType::Media;
        item.format = FileFormat::Other;
    }

    std::error_code ec;
    item.fileSize = fs::file_size(p, ec);
    if (ec) item.fileSize = 0;

    return item;
}

std::vector<FileItem> PhotoMuxer::scanDirectory(const std::string& dirPath, bool recurse) {
    std::vector<FileItem> results;
    fs::path dir(dirPath);
    if (!fs::exists(dir) || !fs::is_directory(dir)) {
        return results;
    }

    auto scanEntry = [&](const fs::directory_entry& entry) {
        if (entry.is_regular_file()) {
            FileItem item = inspectFile(entry.path().string());
            if (item.type != FileType::Unknown) {
                results.push_back(item);
            }
        }
    };

    if (recurse) {
        for (auto it = fs::recursive_directory_iterator(dir, fs::directory_options::skip_permission_denied);
             it != fs::recursive_directory_iterator(); ++it) {
            if (it->is_directory()) {
                std::string name = it->path().filename().string();
                if (name.starts_with(".") || name == "__MACOSX") {
                    it.disable_recursion_pending();
                    continue;
                }
            } else if (it->is_regular_file()) {
                scanEntry(*it);
            }
        }
    } else {
        for (const auto& entry : fs::directory_iterator(dir, fs::directory_options::skip_permission_denied)) {
            if (entry.is_regular_file()) {
                scanEntry(entry);
            }
        }
    }

    return results;
}

bool PhotoMuxer::appendBinaryFile(const std::string& targetPath, const std::string& sourceToAppend) {
    std::ifstream src(sourceToAppend, std::ios::binary);
    if (!src.is_open()) return false;

    std::ofstream dst(targetPath, std::ios::binary | std::ios::app);
    if (!dst.is_open()) return false;

    constexpr size_t BUFFER_SIZE = 64 * 1024; // 64 KB buffer
    std::vector<char> buffer(BUFFER_SIZE);

    while (src.read(buffer.data(), buffer.size()) || src.gcount() > 0) {
        dst.write(buffer.data(), src.gcount());
    }

    return dst.good();
}

std::vector<LivePhotoPair> PhotoMuxer::matchPairs(
    const std::vector<FileItem>& files,
    const std::unordered_map<std::string, Metadata>& metadataMap) {

    std::vector<LivePhotoPair> matchedPairs;
    std::vector<FileItem> photos;
    std::vector<FileItem> videos;
    std::vector<FileItem> otherMedia;
    std::vector<bool> photoMatched;
    std::vector<bool> videoMatched;

    for (const auto& f : files) {
        if (f.type == FileType::Photo) {
            photos.push_back(f);
        } else if (f.type == FileType::Video) {
            videos.push_back(f);
        } else if (f.type == FileType::Media) {
            otherMedia.push_back(f);
        }
    }

    photoMatched.resize(photos.size(), false);
    videoMatched.resize(videos.size(), false);

    // Helper to get metadata for a file
    auto getMeta = [&](const FileItem& item) -> Metadata {
        auto it = metadataMap.find(item.path);
        if (it != metadataMap.end()) return it->second;
        return Metadata{};
    };

    // TIER 1: Match by Apple ContentIdentifier UUID (100% collision-proof)
    std::unordered_map<std::string, std::vector<size_t>> photoByUuid;
    for (size_t i = 0; i < photos.size(); ++i) {
        Metadata m = getMeta(photos[i]);
        if (!m.contentIdentifier.empty()) {
            photoByUuid[m.contentIdentifier].push_back(i);
        }
    }

    for (size_t vIdx = 0; vIdx < videos.size(); ++vIdx) {
        Metadata vMeta = getMeta(videos[vIdx]);
        if (vMeta.contentIdentifier.empty()) continue;

        auto it = photoByUuid.find(vMeta.contentIdentifier);
        if (it != photoByUuid.end() && !it->second.empty()) {
            // Find closest photo in the UUID list
            size_t chosenPIdx = it->second.front();
            for (size_t pCandidate : it->second) {
                if (!photoMatched[pCandidate]) {
                    chosenPIdx = pCandidate;
                    break;
                }
            }

            if (!photoMatched[chosenPIdx]) {
                photoMatched[chosenPIdx] = true;
                videoMatched[vIdx] = true;

                LivePhotoPair pair;
                pair.photo = photos[chosenPIdx];
                pair.video = videos[vIdx];
                pair.metadata = getMeta(photos[chosenPIdx]);
                pair.isPair = true;
                pair.isStarred = photos[chosenPIdx].isStarred || videos[vIdx].isStarred;
                matchedPairs.push_back(pair);
            }
        }
    }

    // TIER 2: Match by (CreateDate, BaseName stem) pattern
    for (size_t vIdx = 0; vIdx < videos.size(); ++vIdx) {
        if (videoMatched[vIdx]) continue;

        Metadata vMeta = getMeta(videos[vIdx]);
        std::string vDate = getDatePart(vMeta.createDate);
        std::regex stemPattern("^" + videos[vIdx].stem + "(_\\d+)?$", std::regex::icase);

        for (size_t pIdx = 0; pIdx < photos.size(); ++pIdx) {
            if (photoMatched[pIdx]) continue;

            Metadata pMeta = getMeta(photos[pIdx]);
            std::string pDate = getDatePart(pMeta.createDate);

            bool dateMatches = (!vDate.empty() && vDate == pDate);
            bool stemMatches = std::regex_match(photos[pIdx].stem, stemPattern);

            if (stemMatches && (dateMatches || vDate.empty() || pDate.empty())) {
                photoMatched[pIdx] = true;
                videoMatched[vIdx] = true;

                LivePhotoPair pair;
                pair.photo = photos[pIdx];
                pair.video = videos[vIdx];
                pair.metadata = pMeta;
                pair.isPair = true;
                pair.isStarred = photos[pIdx].isStarred || videos[vIdx].isStarred;
                matchedPairs.push_back(pair);
                break;
            }
        }
    }

    // TIER 3: Match by identical stem in the exact same parent directory (fallback)
    for (size_t vIdx = 0; vIdx < videos.size(); ++vIdx) {
        if (videoMatched[vIdx]) continue;

        fs::path vDir = fs::path(videos[vIdx].path).parent_path();
        for (size_t pIdx = 0; pIdx < photos.size(); ++pIdx) {
            if (photoMatched[pIdx]) continue;

            fs::path pDir = fs::path(photos[pIdx].path).parent_path();
            if (pDir == vDir && photos[pIdx].stem == videos[vIdx].stem) {
                photoMatched[pIdx] = true;
                videoMatched[vIdx] = true;

                LivePhotoPair pair;
                pair.photo = photos[pIdx];
                pair.video = videos[vIdx];
                pair.metadata = getMeta(photos[pIdx]);
                pair.isPair = true;
                pair.isStarred = photos[pIdx].isStarred || videos[vIdx].isStarred;
                matchedPairs.push_back(pair);
                break;
            }
        }
    }

    // Collect unmatched photos and videos
    for (size_t pIdx = 0; pIdx < photos.size(); ++pIdx) {
        if (!photoMatched[pIdx]) {
            LivePhotoPair single;
            single.photo = photos[pIdx];
            single.metadata = getMeta(photos[pIdx]);
            single.isPair = false;
            single.isStarred = photos[pIdx].isStarred;
            matchedPairs.push_back(single);
        }
    }

    for (size_t vIdx = 0; vIdx < videos.size(); ++vIdx) {
        if (!videoMatched[vIdx]) {
            LivePhotoPair single;
            single.video = videos[vIdx];
            single.metadata = getMeta(videos[vIdx]);
            single.isPair = false;
            single.isStarred = videos[vIdx].isStarred;
            matchedPairs.push_back(single);
        }
    }

    // Collect standalone other media (pass-through)
    for (const auto& item : otherMedia) {
        LivePhotoPair single;
        single.media = item;
        single.isPair = false;
        single.isStarred = item.isStarred;
        matchedPairs.push_back(single);
    }

    return matchedPairs;
}

bool PhotoMuxer::muxPair(const LivePhotoPair& pair,
                         const std::string& outputDir,
                         const PipelineOptions& options,
                         std::string& outPath) {
    if (!pair.isValid()) return false;

    fs::path outDirectory;
    if (outputDir.empty()) {
        outDirectory = fs::path(pair.photo.path).parent_path();
    } else if (options.recurse && !options.inputDir.empty()) {
        std::error_code ec;
        fs::path relDir = fs::relative(fs::path(pair.photo.path).parent_path(), options.inputDir, ec);
        if (!ec && !relDir.empty() && relDir != ".") {
            outDirectory = fs::path(outputDir) / relDir;
        } else {
            outDirectory = fs::path(outputDir);
        }
    } else {
        outDirectory = fs::path(outputDir);
    }
    std::error_code ec;
    fs::create_directories(outDirectory, ec);

    // Determine target format and filename
    std::string baseName = pair.photo.stem + ".MP" + pair.photo.extension;
    fs::path targetMotionPhoto = outDirectory / baseName;
    outPath = targetMotionPhoto.string();

    std::string workingPhotoPath = pair.photo.path;

    // Optional HEIC -> JPG conversion
    if (options.convertHeicToJpg && pair.photo.format == FileFormat::HEIC && m_converter) {
        fs::path convertedPath = outDirectory / (pair.photo.stem + ".JPG");
        std::string res = m_converter->convertHeicToJpg(pair.photo.path, convertedPath.string());
        if (!res.empty()) {
            workingPhotoPath = res;
            targetMotionPhoto = outDirectory / (pair.photo.stem + ".MP.JPG");
            outPath = targetMotionPhoto.string();
        }
    }

    // Step 1: Copy clean image to target destination first
    fs::copy_file(workingPhotoPath, targetMotionPhoto, fs::copy_options::overwrite_existing, ec);
    if (ec) {
        emitLog("Error copying photo to destination: " + ec.message());
        return false;
    }

    // Get companion video size and presentation timestamp
    uint64_t videoSize = pair.video.fileSize;
    if (videoSize == 0) {
        videoSize = fs::file_size(pair.video.path, ec);
    }
    int64_t presentationTs = pair.metadata.getPresentationTimestampUs();

    // Step 2: Inject Google Camera XMP tags FIRST
    std::string targetExt = targetMotionPhoto.extension().string();
    std::transform(targetExt.begin(), targetExt.end(), targetExt.begin(), ::tolower);
    bool isJpeg = (targetExt == ".jpg" || targetExt == ".jpeg");
    bool isHeic = (targetExt == ".heic" || targetExt == ".heif");
    bool tagSuccess = false;

    if (isJpeg) {
        if (m_jpegModifier) {
            tagSuccess = m_jpegModifier->addXmpData(targetMotionPhoto.string(), videoSize, presentationTs, pair.isStarred);
        }
    } else if (isHeic) {
        if (m_heicModifier) {
            tagSuccess = m_heicModifier->addXmpData(targetMotionPhoto.string(), videoSize, presentationTs, pair.isStarred);
        }
    }

    if (!tagSuccess) {
        emitLog("Warning: Tagging step reported failure for " + targetMotionPhoto.filename().string());
        // We still proceed with append if requested, or return false
    }

    // Step 3: Append raw video bytes SECOND
    if (!appendBinaryFile(targetMotionPhoto.string(), pair.video.path)) {
        emitLog("Error appending video bytes to " + targetMotionPhoto.filename().string());
        return false;
    }

    // Step 4: Optional Transport
    if (m_transporter) {
        m_transporter->sendFile(targetMotionPhoto.string(), outputDir);
    }

    // Step 5: Optional delete originals
    if (options.deleteOriginals) {
        fs::remove(pair.photo.path, ec);
        fs::remove(pair.video.path, ec);
        if (workingPhotoPath != pair.photo.path && fs::exists(workingPhotoPath)) {
            fs::remove(workingPhotoPath, ec);
        }
    }

    return true;
}

PipelineResult PhotoMuxer::processDirectory(const PipelineOptions& options) {
    auto startTime = std::chrono::high_resolution_clock::now();
    PipelineResult result;

    emitProgress("Scanning directory for Live Photos...", 5.0f);
    std::vector<FileItem> files = scanDirectory(options.inputDir, options.recurse);
    if (files.empty()) {
        emitLog("No media files found in directory: " + options.inputDir);
        return result;
    }

    // Phase 1: Header metadata extraction (Sequential, low RAM)
    emitProgress("Extracting metadata...", 15.0f);
    std::vector<std::string> paths;
    paths.reserve(files.size());
    for (const auto& f : files) paths.push_back(f.path);

    std::unordered_map<std::string, Metadata> metaMap;
    if (m_parser) {
        metaMap = m_parser->extractMetadataBatch(paths);
    }

    // Phase 1: 3-Tier Pairing
    emitProgress("Grouping and matching pairs...", 30.0f);
    std::vector<LivePhotoPair> allPairs = matchPairs(files, metaMap);

    std::vector<LivePhotoPair> validPairs;
    std::vector<LivePhotoPair> unmatchedItems;

    for (const auto& p : allPairs) {
        if (p.isValid()) {
            validPairs.push_back(p);
        } else {
            unmatchedItems.push_back(p);
        }
    }

    result.pairsFound = validPairs.size();
    emitLog("Found " + std::to_string(result.pairsFound) + " Live Photo pairs to mux.");

    // Phase 2: Sequential Chunked Muxing (Low memory ceiling)
    size_t totalPairs = validPairs.size();
    size_t batchSize = (options.batchSize > 0) ? options.batchSize : 5;

    for (size_t i = 0; i < totalPairs; i += batchSize) {
        size_t currentChunkEnd = std::min(i + batchSize, totalPairs);

        for (size_t j = i; j < currentChunkEnd; ++j) {
            std::string outPath;
            bool success = muxPair(validPairs[j], options.outputDir, options, outPath);

            result.pairsProcessed++;
            if (success) {
                result.pairsSucceeded++;
                result.outputFiles.push_back(outPath);
            } else {
                result.errors.push_back("Failed to mux pair: " + validPairs[j].photo.filename);
            }

            float pct = 30.0f + (static_cast<float>(result.pairsProcessed) / static_cast<float>(std::max<size_t>(totalPairs, 1))) * 60.0f;
            emitProgress("Muxed " + std::to_string(result.pairsProcessed) + " of " + std::to_string(totalPairs) + "...", pct);
        }
    }

    // Handle unmatched and pass-through files (move/copy to output if outputDir specified)
    if (!options.outputDir.empty() && fs::absolute(options.outputDir) != fs::absolute(options.inputDir)) {
        emitProgress("Processing pass-through and unmatched media...", 95.0f);
        fs::create_directories(options.outputDir);

        for (const auto& item : unmatchedItems) {
            std::string srcPath = !item.photo.path.empty() ? item.photo.path :
                                  (!item.video.path.empty() ? item.video.path : item.media.path);
            if (!srcPath.empty() && fs::exists(srcPath)) {
                fs::path dest;
                if (options.recurse && !options.inputDir.empty()) {
                    std::error_code ec;
                    fs::path rel = fs::relative(srcPath, options.inputDir, ec);
                    if (!ec && !rel.empty()) {
                        dest = fs::path(options.outputDir) / rel;
                    } else {
                        dest = fs::path(options.outputDir) / fs::path(srcPath).filename();
                    }
                } else {
                    dest = fs::path(options.outputDir) / fs::path(srcPath).filename();
                }

                std::error_code ec;
                fs::create_directories(dest.parent_path(), ec);
                if (options.deleteOriginals) {
                    fs::rename(srcPath, dest, ec);
                } else {
                    fs::copy_file(srcPath, dest, fs::copy_options::overwrite_existing, ec);
                }
                if (!ec) {
                    if (!item.photo.path.empty()) result.unmatchedPhotosMoved++;
                    else if (!item.video.path.empty()) result.unmatchedVideosMoved++;
                    else result.passThroughMediaCopied++;
                    result.outputFiles.push_back(dest.string());
                    emitLog("Preserved media file at: " + dest.string());
                }
            }
        }
    }

    auto endTime = std::chrono::high_resolution_clock::now();
    result.totalTimeMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();

    emitProgress("Complete!", 100.0f);
    return result;
}

PipelineResult PhotoMuxer::processIndividualFiles(const PipelineOptions& options) {
    auto startTime = std::chrono::high_resolution_clock::now();
    PipelineResult result;

    FileItem photoItem = inspectFile(options.singlePhoto);
    FileItem videoItem = inspectFile(options.singleVideo);

    if (photoItem.type != FileType::Photo || videoItem.type != FileType::Video) {
        result.errors.push_back("Invalid single photo or video inputs provided.");
        return result;
    }

    emitProgress("Reading metadata for pair...", 20.0f);
    Metadata photoMeta;
    if (m_parser) {
        photoMeta = m_parser->extractMetadataSingle(options.singlePhoto);
    }

    LivePhotoPair pair;
    pair.photo = photoItem;
    pair.video = videoItem;
    pair.metadata = photoMeta;
    pair.isPair = true;
    pair.isStarred = photoItem.isStarred || videoItem.isStarred;

    result.pairsFound = 1;

    emitProgress("Muxing Motion Photo...", 60.0f);
    std::string outPath;
    std::string outDir = options.outputDir.empty() ? fs::path(options.singlePhoto).parent_path().string() : options.outputDir;

    if (muxPair(pair, outDir, options, outPath)) {
        result.pairsProcessed = 1;
        result.pairsSucceeded = 1;
        result.outputFiles.push_back(outPath);
    } else {
        result.errors.push_back("Failed to mux individual files.");
    }

    auto endTime = std::chrono::high_resolution_clock::now();
    result.totalTimeMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();

    emitProgress("Complete!", 100.0f);
    return result;
}

PipelineResult PhotoMuxer::process(const PipelineOptions& options) {
    if (!options.singlePhoto.empty() && !options.singleVideo.empty()) {
        return processIndividualFiles(options);
    } else if (!options.inputDir.empty()) {
        return processDirectory(options);
    } else {
        PipelineResult res;
        res.errors.push_back("No input directory or photo/video pair specified.");
        return res;
    }
}

} // namespace livephotobridge
