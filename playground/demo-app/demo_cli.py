#!/usr/bin/env python3
"""
LivePhotoBridge — Unified Demo CLI with Benchmark Timers
Measures and compares performance between:
  1. Direct Native In-Memory Tagging (APP1 marker / libheif)
  2. ExifTool Process Writing (Subprocess / Config execution)
"""

import sys
import os
import json
import time
import ctypes
import ctypes.util
import subprocess
import shutil
from pathlib import Path

# --- 1. Pure Binary JPEG XMP Injection (0 Dependencies) ---
def inject_jpeg_xmp(jpeg_bytes: bytes, xmp_xml: str) -> bytes:
    """Inserts APP1 XMP segment directly into raw JPEG bytes after SOI (0xFFD8)."""
    if len(jpeg_bytes) < 2 or jpeg_bytes[0] != 0xFF or jpeg_bytes[1] != 0xD8:
        raise ValueError("Provided image bytes are not a valid JPEG.")
    
    header = b"http://ns.adobe.com/xap/1.0/\0"
    payload = header + xmp_xml.encode("utf-8")
    app1_length = len(payload) + 2
    app1_segment = b"\xFF\xE1" + app1_length.to_bytes(2, "big") + payload
    return jpeg_bytes[:2] + app1_segment + jpeg_bytes[2:]

# --- 2. Direct libheif Container XMP Injection (0 ExifTool Writing) ---
def inject_heic_xmp_libheif(input_heic_path: str, output_heic_path: str, xmp_xml: str) -> bool:
    """Injects XMP into a HEIC container directly via libheif without re-encoding."""
    dylib_candidates = [
        "/opt/homebrew/lib/python3.12/site-packages/pillow_heif/.dylibs/libheif.1.17.6.dylib",
        "/opt/homebrew/lib/libheif.dylib",
        "/usr/local/lib/libheif.dylib"
    ]
    
    heif_lib = None
    for p in dylib_candidates:
        if os.path.exists(p):
            try:
                heif_lib = ctypes.CDLL(p)
                break
            except Exception:
                pass
                
    if not heif_lib:
        try:
            found = ctypes.util.find_library("heif")
            if found:
                heif_lib = ctypes.CDLL(found)
        except Exception:
            pass

    if not heif_lib:
        raise RuntimeError("libheif dynamic library not found on system.")

    class HeifError(ctypes.Structure):
        _fields_ = [
            ("code", ctypes.c_int),
            ("subcode", ctypes.c_int),
            ("message", ctypes.c_char_p)
        ]

    heif_lib.heif_context_alloc.restype = ctypes.c_void_p
    heif_lib.heif_context_read_from_file.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_void_p]
    heif_lib.heif_context_read_from_file.restype = HeifError
    heif_lib.heif_context_get_primary_image_handle.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    heif_lib.heif_context_get_primary_image_handle.restype = HeifError
    heif_lib.heif_context_add_XMP_metadata.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
    heif_lib.heif_context_add_XMP_metadata.restype = HeifError
    heif_lib.heif_image_handle_release.argtypes = [ctypes.c_void_p]
    heif_lib.heif_context_write_to_file.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    heif_lib.heif_context_write_to_file.restype = HeifError
    heif_lib.heif_context_free.argtypes = [ctypes.c_void_p]

    ctx = heif_lib.heif_context_alloc()
    err = heif_lib.heif_context_read_from_file(ctx, input_heic_path.encode("utf-8"), None)
    if err.code != 0:
        msg = err.message.decode("utf-8") if err.message else f"code {err.code}"
        heif_lib.heif_context_free(ctx)
        raise RuntimeError(f"libheif read error: {msg}")

    handle = ctypes.c_void_p()
    err = heif_lib.heif_context_get_primary_image_handle(ctx, ctypes.byref(handle))
    if err.code != 0:
        heif_lib.heif_context_free(ctx)
        raise RuntimeError(f"libheif get_primary_image_handle error code: {err.code}")

    xml_bytes = xmp_xml.encode("utf-8")
    err = heif_lib.heif_context_add_XMP_metadata(ctx, handle, xml_bytes, len(xml_bytes))
    heif_lib.heif_image_handle_release(handle)

    if err.code != 0:
        heif_lib.heif_context_free(ctx)
        raise RuntimeError(f"libheif add_XMP_metadata error code: {err.code}")

    err = heif_lib.heif_context_write_to_file(ctx, output_heic_path.encode("utf-8"))
    heif_lib.heif_context_free(ctx)

    if err.code != 0:
        raise RuntimeError(f"libheif write_to_file error code: {err.code}")

    return True

# --- 3. Build Standard Google Camera XMP XML ---
def build_gcamera_xmp(video_offset: int, presentation_ts: int) -> str:
    return f"""<?xpacket begin='﻿' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
 <rdf:Description rdf:about='' xmlns:GCamera='http://ns.google.com/photos/1.0/camera/'>
  <GCamera:MicroVideo>1</GCamera:MicroVideo>
  <GCamera:MicroVideoOffset>{video_offset}</GCamera:MicroVideoOffset>
  <GCamera:MicroVideoPresentationTimestampUs>{presentation_ts}</GCamera:MicroVideoPresentationTimestampUs>
  <GCamera:MicroVideoVersion>1</GCamera:MicroVideoVersion>
  <GCamera:MotionPhoto>1</GCamera:MotionPhoto>
  <GCamera:MotionPhotoPresentationTimestampUs>{presentation_ts}</GCamera:MotionPhotoPresentationTimestampUs>
  <GCamera:MotionPhotoVersion>1</GCamera:MotionPhotoVersion>
 </rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>"""

# --- 4. ExifTool Writer Wrapper (For Comparison) ---
def inject_xmp_via_exiftool(photo_path: str, out_path: str, video_size: int, presentation_ts: int, exiftool_cmd: str, config_path: str):
    shutil.copyfile(photo_path, out_path)
    subprocess.run([
        exiftool_cmd, "-config", str(config_path), "-overwrite_original", "-m", "-q",
        "-XMP-GCamera:MicroVideo=1",
        "-XMP-GCamera:MicroVideoVersion=1",
        f"-XMP-GCamera:MicroVideoOffset={video_size}",
        f"-XMP-GCamera:MicroVideoPresentationTimestampUs={presentation_ts}",
        "-XMP-GCamera:MotionPhoto=1",
        "-XMP-GCamera:MotionPhotoVersion=1",
        f"-XMP-GCamera:MotionPhotoPresentationTimestampUs={presentation_ts}",
        str(out_path)
    ], check=True)

# --- 5. Main Muxer Orchestrator with Precision Timers ---
def create_motion_photo(photo_path: str, video_path: str, output_path: str = None, benchmark: bool = False) -> str:
    total_start = time.perf_counter()

    photo_file = Path(photo_path).resolve()
    video_file = Path(video_path).resolve()

    if not photo_file.is_file() or not video_file.is_file():
        raise FileNotFoundError("Photo or video file does not exist.")

    ext = photo_file.suffix
    out_file = Path(output_path) if output_path else photo_file.parent / f"{photo_file.stem}.MP{ext}"

    script_dir = Path(__file__).resolve().parent
    exiftool_bin = script_dir.parent / "photobridge" / "exiftool" / "exiftool"
    exiftool_cmd = str(exiftool_bin) if exiftool_bin.is_file() else "exiftool"
    config_path = script_dir.parent / "photobridge" / "exiftool" / "google_camera.config"

    # Step 1: Read metadata (Timed)
    t0_read = time.perf_counter()
    print(f"[*] Step 1: Reading metadata from {photo_file.name} (ExifTool read-only)...")
    res = subprocess.run([
        exiftool_cmd, "-json", "-ContentIdentifier", "-LivePhotoVideoIndex", "-RunTimeScale", str(photo_file)
    ], capture_output=True, text=True)

    live_index = 0
    time_scale = 1
    if res.returncode == 0 and res.stdout.strip():
        try:
            data = json.loads(res.stdout)
            if data:
                live_index = int(data[0].get("LivePhotoVideoIndex", 0))
                time_scale = int(data[0].get("RunTimeScale", 1)) or 1
        except Exception:
            pass

    presentation_ts = int((live_index / time_scale) * 1_000_000) if live_index else 750_000
    video_size = os.path.getsize(video_file)
    t_read_ms = (time.perf_counter() - t0_read) * 1000

    print(f"    - Video Offset: {video_size:,} bytes")
    print(f"    - Presentation Timestamp: {presentation_ts:,} µs")
    print(f"    ⏱️  Read Metadata Time: {t_read_ms:.2f} ms")

    xmp_xml = build_gcamera_xmp(video_size, presentation_ts)
    is_heic = ext.lower() in [".heic", ".heif"]
    is_jpeg = ext.lower() in [".jpg", ".jpeg"]

    # --- BENCHMARK MODE: Compare Both Approaches Side-by-Side ---
    if benchmark or "--benchmark" in sys.argv:
        print("\n" + "="*60)
        print("  📊 PERFORMANCE BENCHMARK: Tagging Methods Comparison")
        print("="*60)
        
        # Test A: ExifTool Process Writing
        t0_et = time.perf_counter()
        tmp_et_out = f"/tmp/bench_et{ext}"
        inject_xmp_via_exiftool(str(photo_file), tmp_et_out, video_size, presentation_ts, exiftool_cmd, config_path)
        t_et_ms = (time.perf_counter() - t0_et) * 1000
        if os.path.exists(tmp_et_out): os.remove(tmp_et_out)

        # Test B: Native In-Memory Tagging
        t0_nat = time.perf_counter()
        tmp_nat_out = f"/tmp/bench_nat{ext}"
        native_success = False
        native_method_name = ""
        try:
            if is_heic:
                native_method_name = "libheif C API container injection"
                inject_heic_xmp_libheif(str(photo_file), tmp_nat_out, xmp_xml)
                native_success = True
            elif is_jpeg:
                native_method_name = "Pure byte APP1 marker insertion"
                with open(photo_file, "rb") as f:
                    p_bytes = f.read()
                tagged = inject_jpeg_xmp(p_bytes, xmp_xml)
                with open(tmp_nat_out, "wb") as f:
                    f.write(tagged)
                native_success = True
        except Exception as e:
            native_method_name = f"Native failed ({e})"
        t_nat_ms = (time.perf_counter() - t0_nat) * 1000
        if os.path.exists(tmp_nat_out): os.remove(tmp_nat_out)

        print(f"  [1] ExifTool Process Writing:    {t_et_ms:8.2f} ms")
        if native_success:
            speedup = t_et_ms / max(t_nat_ms, 0.001)
            print(f"  [2] Native Direct Tagging:      {t_nat_ms:8.2f} ms  ({native_method_name})")
            print(f"  ⚡ Result: Native is {speedup:.1f}x FASTER than spawning ExifTool!")
        else:
            print(f"  [2] Native Direct Tagging:      N/A ({native_method_name})")
        print("="*60 + "\n")

    # Step 2: Inject XMP metadata for final output (Timed)
    t0_inject = time.perf_counter()
    print(f"[*] Step 2: Injecting XMP metadata...")
    if is_heic:
        try:
            print(f"    -> Attempting libheif container injection...")
            inject_heic_xmp_libheif(str(photo_file), str(out_file), xmp_xml)
            inject_type = "libheif C API"
        except Exception as e:
            print(f"    [!] libheif notice: {e}")
            print(f"    -> Using ExifTool container fallback...")
            inject_xmp_via_exiftool(str(photo_file), str(out_file), video_size, presentation_ts, exiftool_cmd, config_path)
            inject_type = "ExifTool Fallback"
    elif is_jpeg:
        print(f"    -> Using direct APP1 marker byte insertion for JPEG (0 ExifTool)...")
        with open(photo_file, "rb") as f:
            photo_bytes = f.read()
        tagged_jpeg = inject_jpeg_xmp(photo_bytes, xmp_xml)
        with open(out_file, "wb") as f:
            f.write(tagged_jpeg)
        inject_type = "Native APP1"
    else:
        raise ValueError(f"Unsupported format: {ext}")

    t_inject_ms = (time.perf_counter() - t0_inject) * 1000
    print(f"    ⏱️  Injection Time ({inject_type}): {t_inject_ms:.2f} ms")

    # Step 3: Append video stream (Timed)
    t0_append = time.perf_counter()
    print(f"[*] Step 3: Appending {video_file.name} ({video_size:,} bytes) to {out_file.name}...")
    with open(out_file, "ab") as outfile, open(video_file, "rb") as vid:
        outfile.write(vid.read())
    t_append_ms = (time.perf_counter() - t0_append) * 1000
    print(f"    ⏱️  Append Time: {t_append_ms:.2f} ms")

    total_time_ms = (time.perf_counter() - total_start) * 1000
    print(f"\n[✓] Success! Generated Motion Photo in {total_time_ms:.2f} ms:")
    print(f"    {out_file}\n")
    return str(out_file)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 demo_cli.py <photo.heic|photo.jpg> <video.mov|video.mp4> [output_path] [--benchmark]")
        sys.exit(1)

    benchmark_flag = "--benchmark" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--benchmark"]

    p = args[0]
    v = args[1]
    out = args[2] if len(args) > 2 else None

    create_motion_photo(p, v, out, benchmark=benchmark_flag)
