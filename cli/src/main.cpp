#include "PhotoMuxer.hpp"
#include "JpegModifier.hpp"
#include "LocalParser.hpp"
#include "HeicModifier.hpp"
#include "LocalConverter.hpp"
#include "LocalTransporter.hpp"
#include <iostream>
#include <iomanip>
#include <chrono>
#include <filesystem>
#include <nlohmann/json.hpp>

using namespace livephotobridge;
namespace fs = std::filesystem;
using json = nlohmann::json;

namespace {

const char* VERSION = "1.0.0";

void printUsage(const char* progName) {
    std::cout << "LivePhotoBridge CLI v" << VERSION << "\n"
              << "Fast, native C++ tool to convert Apple Live Photos into Google Motion Photos.\n\n"
              << "Usage:\n"
              << "  " << progName << " --dir <path> [options]\n"
              << "  " << progName << " --photo <photo.heic|jpg> --video <video.mov|mp4> [options]\n\n"
              << "Options:\n"
              << "  --dir <path>          Input directory to scan for Live Photos\n"
              << "  --photo <path>        Single photo input (.heic, .jpg)\n"
              << "  --video <path>        Single video input (.mov, .mp4)\n"
              << "  --output, -o <path>   Output directory (default: same as input)\n"
              << "  --recurse, -r         Recursively scan input directory\n"
              << "  --convert-heic, --heic Convert HEIC photos to JPEG\n"
              << "  --delete-originals    Delete original files after successful muxing\n"
              << "  --batch-size <N>      Batch chunk size for memory limit (default: 5)\n"
              << "  --json                Emit machine-readable JSON progress stream\n"
              << "  --benchmark           Display high-resolution timing breakdown\n"
              << "  --verbose, -v         Enable detailed debug logging\n"
              << "  --help, -h            Show this help message\n"
              << "  --version             Show version information\n";
}

void renderProgressBar(float percentage, const std::string& message) {
    int barWidth = 35;
    std::cout << "\r[";
    int pos = static_cast<int>(barWidth * (percentage / 100.0f));
    for (int i = 0; i < barWidth; ++i) {
        if (i < pos) std::cout << "=";
        else if (i == pos) std::cout << ">";
        else std::cout << " ";
    }
    std::cout << "] " << std::setw(3) << static_cast<int>(percentage) << "% "
              << message << std::flush;
    if (percentage >= 100.0f) {
        std::cout << std::endl;
    }
}

} // anonymous namespace

int main(int argc, char* argv[]) {
    PipelineOptions options;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];

        if (arg == "--help" || arg == "-h") {
            printUsage(argv[0]);
            return 0;
        } else if (arg == "--version") {
            std::cout << "LivePhotoBridge v" << VERSION << std::endl;
            return 0;
        } else if (arg == "--dir" && i + 1 < argc) {
            options.inputDir = argv[++i];
        } else if (arg == "--photo" && i + 1 < argc) {
            options.singlePhoto = argv[++i];
        } else if (arg == "--video" && i + 1 < argc) {
            options.singleVideo = argv[++i];
        } else if ((arg == "--output" || arg == "-o") && i + 1 < argc) {
            options.outputDir = argv[++i];
        } else if (arg == "--recurse" || arg == "-r") {
            options.recurse = true;
        } else if (arg == "--convert-heic" || arg == "--heic") {
            options.convertHeicToJpg = true;
        } else if (arg == "--delete-originals") {
            options.deleteOriginals = true;
        } else if (arg == "--batch-size" && i + 1 < argc) {
            options.batchSize = std::stoul(argv[++i]);
        } else if (arg == "--json") {
            options.jsonOutput = true;
        } else if (arg == "--benchmark") {
            options.benchmark = true;
        } else if (arg == "--verbose" || arg == "-v") {
            options.verbose = true;
        } else {
            std::cerr << "Unknown argument: " << arg << "\n";
            printUsage(argv[0]);
            return 1;
        }
    }

    if (options.inputDir.empty() && (options.singlePhoto.empty() || options.singleVideo.empty())) {
        std::cerr << "Error: Must specify either --dir or both --photo and --video.\n\n";
        printUsage(argv[0]);
        return 1;
    }

    if (!options.outputDir.empty()) {
        std::error_code ec;
        fs::create_directories(options.outputDir, ec);
    }

    // Initialize Concrete Strategies
    auto parser = std::make_shared<LocalParser>();
    auto jpegModifier = std::make_shared<JpegModifier>();
    auto heicModifier = std::make_shared<HeicModifier>();
    auto transporter = std::make_shared<LocalTransporter>();
    auto converter = options.convertHeicToJpg ? std::make_shared<LocalConverter>() : nullptr;

    // Initialize Engine
    PhotoMuxer muxer(parser, jpegModifier, heicModifier, transporter, converter);

    // Setup Progress & Log Callbacks
    if (options.jsonOutput) {
        muxer.setProgressCallback([](const std::string& msg, float pct) {
            json j = {{"type", "progress"}, {"message", msg}, {"percentage", pct}};
            std::cout << j.dump() << "\n" << std::flush;
        });
        muxer.setLogCallback([](const std::string& msg) {
            json j = {{"type", "log"}, {"message", msg}};
            std::cout << j.dump() << "\n" << std::flush;
        });
    } else {
        muxer.setProgressCallback([](const std::string& msg, float pct) {
            renderProgressBar(pct, msg);
        });
        muxer.setLogCallback([&options](const std::string& msg) {
            if (options.verbose) {
                std::cout << "[LOG] " << msg << "\n";
            }
        });
    }

    if (!options.jsonOutput) {
        std::cout << "\n📷 LivePhotoBridge v" << VERSION << " — C++ Core\n";
        std::cout << "───────────────────────────────────────────────\n";
        if (!options.inputDir.empty()) {
            std::cout << "Target Directory : " << fs::absolute(options.inputDir).string() << "\n";
            std::cout << "Recursive Search : " << (options.recurse ? "Enabled" : "Disabled") << "\n";
        } else {
            std::cout << "Single Photo     : " << options.singlePhoto << "\n";
            std::cout << "Single Video     : " << options.singleVideo << "\n";
        }
        if (!options.outputDir.empty()) {
            std::cout << "Output Directory : " << fs::absolute(options.outputDir).string() << "\n";
        }
        std::cout << "HEIC Conversion  : " << (options.convertHeicToJpg ? "Enabled (.JPG)" : "Pass-Through (.HEIC)") << "\n";
        std::cout << "Delete Originals : " << (options.deleteOriginals ? "Yes" : "No") << "\n";
        std::cout << "Batch Chunk Size : " << options.batchSize << " pairs\n";
        std::cout << "───────────────────────────────────────────────\n\n";
    }

    PipelineResult result = muxer.process(options);

    if (!options.jsonOutput) {
        std::cout << "\n🎉 Finished Processing!\n";
        std::cout << "───────────────────────────────────────────────\n";
        std::cout << "  Live Photo Pairs Found     : " << result.pairsFound << "\n";
        std::cout << "  Motion Photos Created      : " << result.pairsSucceeded << "\n";
        if (result.unmatchedPhotosMoved > 0) {
            std::cout << "  Unmatched Photos Relocated : " << result.unmatchedPhotosMoved << "\n";
        }
        if (result.unmatchedVideosMoved > 0) {
            std::cout << "  Unmatched Videos Relocated : " << result.unmatchedVideosMoved << "\n";
        }
        if (result.passThroughMediaCopied > 0) {
            std::cout << "  Pass-Through Media Copied  : " << result.passThroughMediaCopied << "\n";
        }
        std::cout << "  Total Execution Time       : " << std::fixed << std::setprecision(2) << result.totalTimeMs << " ms\n";
        if (result.pairsSucceeded > 0) {
            double avgTime = result.totalTimeMs / static_cast<double>(result.pairsSucceeded);
            std::cout << "  Average Time Per Pair      : " << avgTime << " ms\n";
        }
        std::cout << "───────────────────────────────────────────────\n";

        if (!result.errors.empty()) {
            std::cerr << "\nWarnings/Errors Encountered (" << result.errors.size() << "):\n";
            for (const auto& err : result.errors) {
                std::cerr << "  - " << err << "\n";
            }
        }

        if (options.benchmark) {
            std::cout << "\n📊 BENCHMARK TIMING BREAKDOWN:\n";
            std::cout << "  Total Pipeline Time : " << result.totalTimeMs << " ms\n";
            std::cout << "  Throughput          : " 
                      << (result.pairsSucceeded > 0 ? (result.pairsSucceeded / (result.totalTimeMs / 1000.0)) : 0.0) 
                      << " photos/sec\n\n";
        }
    }

    return (result.pairsFound > 0 && result.pairsSucceeded == 0) ? 1 : 0;
}
