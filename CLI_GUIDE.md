# LivePhotoBridge C++ CLI — Quickstart Guide

`livephotobridge` is a native, high-performance C++ tool that transforms Apple Live Photo pairs (`.HEIC`/`.JPG` + `.MOV`) into Google Motion Photos playable on Google Pixel and Google Photos.

---

## 1. Quick Build

LivePhotoBridge uses **Meson + Ninja**. C++ dependencies (`nlohmann_json`) are automatically fetched via Meson Wrap, and `exiftool` is bundled in `libs/exiftool/`:

```bash
# First-time configuration
meson setup build

# Compile the static core and CLI executable
ninja -C build
```

To run the unit test suite:
```bash
meson test -C build -v
```

---

## 2. Trying Out the CLI (Sample Images Included)

Sample Live Photos are ready in the `sample_images/` directory:
- `IMG_2741.JPG` + `IMG_2741.MOV` (JPEG pair)
- `IMG_3009.HEIC` + `IMG_3009.MOV` (HEIC pair with Apple HDR & Depth layers)
- `IMG_3010.HEIC` + `IMG_3010.MOV` (HEIC pair)

### A. Process a Single Live Photo Pair
```bash
./build/cli/livephotobridge \
  --photo sample_images/IMG_2741.JPG \
  --video sample_images/IMG_2741.MOV \
  -o ~/Desktop/LivePhotoOutput
```

### B. Batch Process an Entire Directory
```bash
./build/cli/livephotobridge \
  --dir sample_images \
  -o ~/Desktop/LivePhotoOutput \
  --benchmark
```

### C. Convert HEIC to JPEG (Optional)
```bash
./build/cli/livephotobridge \
  --dir sample_images \
  -o ~/Desktop/LivePhotoOutput \
  --convert-heic
```

---

## 3. Verify the Output

Inspect the generated `.MP.heic` or `.MP.jpg` file using ExifTool:

```bash
libs/exiftool/exiftool -G1 -a -s -XMP-GCamera:all ~/Desktop/LivePhotoOutput/IMG_3009.MP.HEIC
```

You will see:
```
[XMP-GCamera]   MicroVideo                         : 1
[XMP-GCamera]   MicroVideoOffset                   : 4236630
[XMP-GCamera]   MicroVideoPresentationTimestampUs  : 8595185
[XMP-GCamera]   MicroVideoVersion                  : 1
[XMP-GCamera]   MotionPhoto                        : 1
[XMP-GCamera]   MotionPhotoPresentationTimestampUs : 8595185
[XMP-GCamera]   MotionPhotoVersion                 : 1
```

---

## 4. Full Options Reference

| Option | Description |
| :--- | :--- |
| `--dir <path>` | Input directory to scan for Live Photos |
| `--photo <path>` | Single photo input (`.heic`, `.jpg`) |
| `--video <path>` | Single video input (`.mov`, `.mp4`) |
| `-o, --output <path>` | Output directory (default: same as input) |
| `-r, --recurse` | Recursively scan subdirectories |
| `--convert-heic`, `--heic` | Convert HEIC photos to JPEG before muxing |
| `--delete-originals` | Delete original photo and video after successful mux |
| `--batch-size <N>` | Sequential batch chunk size (default: 5, keeps RAM < 50MB) |
| `--benchmark` | Display high-resolution timing breakdown and throughput |
| `--json` | Emit machine-readable JSON progress events for GUIs |
| `-v, --verbose` | Verbose debug logging |
| `-h, --help` | Display help screen |
