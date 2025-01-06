LivePhotoBridge
================
Retain Apple Live Photos when transferring from iPhone to Pixel's Motion Photos.

This version is made specifically for macOS because I wanted to make sure there is .HEIC support and a stable GUI. Linux and Windows support is completely possible, and can probably even work if you sub in ./src/linux_heic_to_jpg.py (doesn't exist yet) for the Mac version.

> This started out as a fork of MotionPhotoMuxer found [here](https://github.com/mihir-io/MotionPhotoMuxer), but turned out a lot different. The main similarity is the code for combining the image and video. 
> 
> As described in the credits of [MotionPhotoMuxer](https://github.com/mihir-io/MotionPhotoMuxer), this wouldn't have been possible without the writeup on the process of working with MicroVideo [here](https://medium.com/android-news/working-with-motion-photos-da0aa49b50c), along with the blog detailing the update to the format called MotionPhotos [here](https://timojyrinki.gitlab.io/hugo/post/2021-03-30-pixel-motionphoto-microvideo-file-formats/)


# Installation

### Prerequisites
* homebrew (or follow the steps at [https://exiftool.org](https://exiftool.org/install.html))
* python3

Get ExifTool installed. This is what is used to get metadata from the photos and videos. 
It doesn't matter how you install it as long as it can be found on the PATH. 
~~~bash
brew install exiftool
~~~


# Usage

## GUI

> work in progress

## CLI

**command:**
```bash
python3 PhotoBridge.py [-h] [--verbose] [--dir DIR] [--recurse] [--photo PHOTO] [--video VIDEO] [--output OUTPUT] [--heic]
```
**options:**
```
  -h, --help       show this help message and exit
  --dir DIR        Process a directory for photos/videos. Takes precedence over --photo/--video
  --recurse        Recursively scan subdirectories for photos and videos. This option only applies if the `--dir` option is also provided.
  --photo PHOTO    Path to the JPEG photo to add. Only used when processing individual files.
  --video VIDEO    Path to the MOV video to add. Only used when processing individual files.
  --output OUTPUT  Path to where files should be written out to. If not specified, the output will be placed in the same directory as the input files.
  --heic           Convert all .HEIC to .JPG (macOS only). If not given, but .HEIC present, it will be brought to output, but not as a Motion Photo.
```

## Examples

**example 1: processing a directory recursively**
   ```bash
   python PhotoBridge.py --dir /path/to/directory --recurse --output /path/to/output
   ```

   This will process all photos and videos in the specified directory and its subdirectories.

**example 2: processing a single photo and video**
   ```bash
   python PhotoBridge.py --photo /path/to/photo.jpg --video /path/to/video.mov --output /path/to/output
   ```

   This will create a Motion Photo from the specified photo and video files.

**example 3: converting `.HEIC` files to `.JPG` and processing**
   ```bash
   python PhotoBridge.py --dir /path/to/directory --heic --output /path/to/output
   ```

   This will convert all `.HEIC` files in the directory to `.JPG` and then proceed with the Motion Photo creation.

## Notes
- The `--dir` option takes precedence over the `--photo` and `--video` options, so if you provide `--dir`, you don't need to specify `--photo` and `--video`.
- The script is designed to work primarily with `.JPG` and `.MOV` files. If `.HEIC` files are present, you must use the `--heic` flag on macOS for conversion.


# Performance
This has been tested a bunch between an iPhone 11 Pro, iPhone 16 Pro, and MacBook Pro M1. 

| Files | HEIC Conversion | Time (s) | Error Rate (%) |
|-------|-----------------|----------|----------------|
| 1809  | Yes             | 230      | 0%             |
| 1809  | Yes             | 208      | 0%             |

> **Note**
> Based on my own testing, the only errors encountered are on the edge case where
> a video doesn't have a ContentIdentifier, and the CreateDate has rolled over into the next day
> due to some offset that Apple uses from the video and photo.
>
> This problem only occurs for .HEIC photos taken on iPhone 16 Pro, and has likely been fixed by Apple,
> but I am not sure. 
