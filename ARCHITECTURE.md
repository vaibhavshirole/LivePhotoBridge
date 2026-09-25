# LivePhotoBridge — Architecture & Technical Specification

## 1. Overview & Goals
LivePhotoBridge converts Apple Live Photo pairs (`.heic` / `.jpg` + `.mov` / `.mp4`) into native **Google Motion Photos** (`.MP.heic` or `.MP.jpg`) recognized and playable by Google Photos, Google Pixel, and Android gallery apps.

The core is implemented in **C++** and compiled to two primary build targets:
1. **`photobridge-cli`**: Fast, native cross-platform terminal CLI.
2. **`photobridge-web`**: Zero-upload, client-side WebAssembly (WASM) web application.

---

## 2. Core Architectural Design Patterns

```
                          TWO-PHASE LOW-MEMORY PIPELINE
┌───────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: DISCOVERY & 3-TIER PAIRING (< 1 MB RAM)                                  │
│ 1. Scan headers sequentially (ExifTool / WASM)                                    │
│ 2. Extract UUIDs & Build Pairing Dictionary: { "UUID": [PhotoHandle, VideoHandle] }│
└────────────────────────────────────────┬──────────────────────────────────────────┘
                                         │
                                         ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: GROUPED / CHUNKED MUXING PIPELINE (< 50 MB Peak RAM)                     │
│ Loop through pairs in small groups (1–5 pairs at a time):                         │
│   ┌────────────────────────────────────────────────────────────────────────────┐  │
│   │ A. Load Pair #N full bytes into RAM                                        │  │
│   │ B. Inject XMP:                                                             │  │
│   │    - JPEG: Direct C++ APP1 Injection (0.3ms)                               │  │
│   │    - HEIC: ExifTool / libheif Container Tagging (Tag-First)                │  │
│   │ C. Append Video Stream bytes in binary mode                                │  │
│   │ D. Stream to Pixel / Write to Disk                                         │  │
│   │ E. IMMEDIATELY FREE / GARBAGE COLLECT Pair #N RAM                          │  │
│   └────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Pattern Breakdown
* **Pipeline (Pipes & Filters):** Unidirectional, staged data flow with strict phase separation.
* **Chunked / Streaming Execution:** Decouples file discovery from file payload processing to enforce a flat **`< 50 MB` memory ceiling** across 50GB+ camera rolls on both mobile browsers (iOS Safari) and desktop CLI.
* **Strategy Pattern:** Swappable adapters for platform-specific capabilities (CLI Subprocess vs. WASM Web Worker).

---

## 3. Pairing Hierarchy (100% Collision-Proof)

To handle nested subdirectories and duplicate filenames (`2023/IMG_0001.HEIC` vs `2024/IMG_0001.HEIC`), pairing operates on a strict 3-tier hierarchy:

1. **Tier 1: Apple `ContentIdentifier` UUID (Primary — Collision-Proof):**
   - Live Photos share a matching 128-bit UUID (e.g. `BAA4EFCC-E338-4DB1-826A-7FD5B070162B`).
   - Grouped into `{ [content_identifier]: [photo_handle, video_handle] }`.
2. **Tier 2: `(CreateDate, BaseName)` Compound Key (Fallback):**
   - Used only when `ContentIdentifier` is missing or stripped during export.
   - Matches files sharing identical creation timestamp down to the second + base filename.
3. **Tier 3: Unmatched Bucket:**
   - Single photos or orphan videos are passed through unmodified to the output directory.

---

## 4. Tiered XMP Tagging & Muxing Strategy

### A. JPEG Files (`.jpg`, `.jpeg`) — *100% Native C++ (Sub-millisecond)*
- **Mechanism:** Direct in-memory `APP1` segment injection (`0xFF 0xE1`).
- **Performance:** **`< 0.5 ms`** per photo (400x faster than spawning external tools).
- **Dependencies:** **Zero external tools or libraries needed.**

```cpp
// Pure C++ APP1 Marker Injection:
void injectJpegXmp(std::vector<uint8_t>& jpegBytes, const std::string& xmpXml) {
    const std::string header = "http://ns.adobe.com/xap/1.0/\0";
    uint16_t length = 2 + header.size() + xmpXml.size();

    std::vector<uint8_t> app1;
    app1.push_back(0xFF);
    app1.push_back(0xE1); // APP1 marker
    app1.push_back((length >> 8) & 0xFF);
    app1.push_back(length & 0xFF);
    app1.insert(app1.end(), header.begin(), header.end());
    app1.insert(app1.end(), xmpXml.begin(), xmpXml.end());

    // Insert APP1 right after JPEG SOI (0xFFD8, at index 2)
    jpegBytes.insert(jpegBytes.begin() + 2, app1.begin(), app1.end());
}
```

### B. HEIC Files (`.heic`, `.heif`) — *Tag-First-Append-Second Container Tagging*
- **Mechanism:** ExifTool (CLI / WASM) or `libheif` container XMP injection.
- **Order of Operations:**
  1. Write XMP metadata to the pristine `.heic` container **first**.
  2. Append the `.mov` video bytes **second** in binary append mode.
- **Why this is critical:** Preserves Apple's complex proprietary auxiliary tracks (HDR Gain Maps, Portrait Depth Maps, Semantic Mattes) while avoiding ISO atom `stco` chunk offset corruption.

---

## 5. Universal XMP Specification

Every generated Motion Photo receives both **v1 (`MicroVideo`)** and **v2 (`MotionPhoto`)** tags:

```xml
<?xpacket begin='﻿' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
 <rdf:Description rdf:about='' xmlns:GCamera='http://ns.google.com/photos/1.0/camera/'>
  <GCamera:MicroVideo>1</GCamera:MicroVideo>
  <GCamera:MicroVideoOffset>{VIDEO_OFFSET_BYTES}</GCamera:MicroVideoOffset>
  <GCamera:MicroVideoPresentationTimestampUs>{TIMESTAMP_US}</GCamera:MicroVideoPresentationTimestampUs>
  <GCamera:MicroVideoVersion>1</GCamera:MicroVideoVersion>
  <GCamera:MotionPhoto>1</GCamera:MotionPhoto>
  <GCamera:MotionPhotoPresentationTimestampUs>{TIMESTAMP_US}</GCamera:MotionPhotoPresentationTimestampUs>
  <GCamera:MotionPhotoVersion>1</GCamera:MotionPhotoVersion>
 </rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>
```

### Timing Formula
$$\text{PresentationTimestampUs} = \left(\frac{\text{LivePhotoVideoIndex}}{\text{RunTimeScale}}\right) \times 1{,}000{,}000$$

---

## 6. Build Target Comparison

| Component | **`photobridge-cli`** (Native C++) | **`photobridge-web`** (WASM) |
| :--- | :--- | :--- |
| **Build System** | **Meson + Ninja** (`meson setup build`) | **Meson + Emscripten** (`--cross-file emscripten.ini`) |
| **Compiler** | `clang++` / `g++` (`cpp_std=c++20`) | `em++` (Emscripten toolchain) |
| **Memory Model** | Sequential Stream (`< 50 MB` RAM) | Sequential Stream (`< 50 MB` RAM) |
| **Metadata Read** | Native `exiftool` (Single pass) | `@uswriting/exiftool` (WASM) |
| **JPEG XMP Write** | **Direct C++ `APP1` injection** | **Direct C++ `APP1` injection** |
| **HEIC XMP Write** | ExifTool container tagging | `@uswriting/exiftool` write |
| **HEIC Convert** | `sips` / `libheif` | `libheif-js` / `OffscreenCanvas` |
| **Video Muxing** | Pure binary file stream append | `Uint8Array` / `Blob` concatenation |
| **Output / Sync** | Local disk / Wireless ADB / Local HTTP | Browser Download / WebRTC P2P |

---

## 7. Directory Structure Blueprint

```
LivePhotoBridge/
├── meson.build                              # Root Meson build configuration
├── emscripten.ini                           # Meson cross-compilation file for WebAssembly
│
├── libs/                                    # Vendored & Bundled Dependencies
│   ├── exiftool/                            # Standalone ExifTool, Perl libs & config
│   │   ├── exiftool
│   │   ├── google_camera.config
│   │   └── lib/
│   └── json/                                # Self-contained nlohmann/json C++ library
│       └── nlohmann/
│
├── core/                                    # 100% Shared C++ Core (Minimal & Flat)
│   ├── meson.build                         # Builds `libcore.a` static library
│   ├── include/
│   │   ├── PhotoMuxer.hpp                  # Pipeline Orchestrator (includes matchPairs())
│   │   ├── Types.hpp                       # LivePhotoPair, Metadata, Config structs
│   │   ├── JpegModifier.hpp                # Direct C++ APP1 byte injection
│   │   │
│   │   └── interfaces/                     # Pure Virtual Strategy Interfaces
│   │       ├── IParser.hpp                 # virtual getMetadata() = 0
│   │       ├── IModifier.hpp               # virtual addXmpData() = 0
│   │       ├── IConverter.hpp              # virtual convertHeicToJpg() = 0
│   │       └── ITransporter.hpp            # virtual sendFiles() = 0
│   │
│   └── src/
│       ├── PhotoMuxer.cpp                  # Pipeline execution + matchPairs() logic
│       └── JpegModifier.cpp                # 0.3ms APP1 byte injection implementation
│
├── cli/                                     # NATIVE CLI TARGET (macOS / Linux / Windows)
│   ├── meson.build                         # Compiles `photobridge` CLI executable
│   └── src/
│       ├── main.cpp                        # CLI Entry Point & Flag Parser
│       ├── LocalParser.cpp                 # Implements IParser via native ExifTool binary
│       ├── HeicModifier.cpp                # Implements IModifier via ExifTool container tagging
│       ├── LocalConverter.cpp              # Implements IConverter via sips / libheif
│       └── LocalTransporter.cpp            # Implements ITransporter via Local HTTP / ADB
│
├── web/                                     # WEBASSEMBLY TARGET (In-Browser)
│   ├── meson.build                         # Compiles `photobridge.wasm` & `photobridge.js`
│   ├── src/
│   │   ├── main.cpp                        # Web Entry Point & Embind Exports
│   │   ├── WebParser.cpp                   # Implements IParser via @uswriting/exiftool
│   │   ├── WebHeicModifier.cpp             # Implements IModifier via WASM ExifTool
│   │   ├── WebConverter.cpp                # Implements IConverter via libheif-js / Canvas
│   │   └── WebTransporter.cpp              # Implements ITransporter via WebRTC DataChannel
│   └── public/
│       ├── index.html                      # Web App UI (Dropzone, Live Preview, QR code)
│       ├── app.js                          # Frontend UI controller
│       └── worker.js                       # Background Web Worker executing WASM
│
└── demo-app/                               # Standalone Verification Prototypes
    ├── index.html                          # In-browser player & muxer demo
    ├── demo_cli.py                         # Benchmarked native CLI demo
    └── README.md
```

---

## 8. Meson Build Commands

### 1. Build Native CLI (`photobridge`)
```bash
# Configure & compile with Ninja backend:
meson setup build
ninja -C build

# Run the native CLI:
./build/cli/photobridge --help
```

### 2. Build WebAssembly Target (`photobridge.wasm` + `photobridge.js`)
```bash
# Cross-compile for WebAssembly using Emscripten toolchain:
meson setup build-wasm --cross-file emscripten.ini
ninja -C build-wasm
```
