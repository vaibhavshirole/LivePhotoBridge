LivePhotoBridge
================
Retain Apple Live Photos when transferring from iPhone to Pixel's Motion Photos.

When moving photos between your iPhone and Pixel ~~for the free Google Photos storage~~, you might have noticied that the *Live* disappears, even though Google supports it. This app fixes that by combining an image and video file to create a *Motion Photo*. Use **Image Capture.app** to import your iPhone photos to your Mac and then run this app on the imported photos and it will provide a single image file containing video data inside, allowing your Pixel to display it as "Live".

This repo has two options. Either running it in the CLI (pic below on the right) or with a dedicated GUI (on the left). The CLI app is all using Python, and the GUI is done with Electron and just runs the Python script underneath it. I've only compiled it for macOS, but the only macOS exclusive part is the .HEIC support.

> This started out as a fork of MotionPhotoMuxer found [here](https://github.com/mihir-io/MotionPhotoMuxer), but turned out a lot different. The main similarity is the code for combining the image and video. 
> 
> As described in the credits of [MotionPhotoMuxer](https://github.com/mihir-io/MotionPhotoMuxer), this wouldn't have been possible without the writeup on the process of working with MicroVideo [here](https://medium.com/android-news/working-with-motion-photos-da0aa49b50c), along with the blog detailing the update to the format called MotionPhotos [here](https://timojyrinki.gitlab.io/hugo/post/2021-03-30-pixel-motionphoto-microvideo-file-formats/)


<p align="middle">
<img src="https://github.com/vaibhavshirole/LivePhotoBridge/blob/main/playground/visual-interface.png?raw=true" alt= “mini-lamp-purple” width="55%" height="100%">
<img src="https://github.com/vaibhavshirole/LivePhotoBridge/blob/main/playground/cli-interface.png?raw=true" alt= “mini-lamp-purple” width="44%" height="100%">
</p>

# Installation

### CLI

If you prefer to run the script directly, you can clone the repository and use the Python script from the command line. You can also compile it for other platforms if you want to.

```bash
git clone https://github.com/yourusername/photobridge.git
cd photobridge
```

Otherwise, you can install the **.app** from Releases

### GUI
1. Download the latest `.dmg` file from the [Releases](https://github.com/vaibhavshirole/LivePhotoBridge/releases) page
2. Double-click the downloaded `.dmg` file to open it
3. Drag PhotoBridge to your Applications folder
4. Open PhotoBridge from your Applications folder

**Note**: When opening PhotoBridge for the first time, macOS might show a security warning. If this happens:
1. Go to System Settings → Privacy & Security
2. Scroll down to find the message about PhotoBridge being blocked
3. Click "Open Anyway" to allow the app to run


# Usage

## GUI

1. **Launch PhotoBridge** from your Applications folder
2. **Choose your operation mode**:
   - **Single Files**: Process individual photo/video pairs
   - **Directory**: Process an entire folder of photos and videos
3. Enable options as needed:
   - **Process Subdirectories**: Include all subfolders in the processing
   - **Convert HEIC**: Automatically convert HEIC files (no quality reduction) to JPG before processing

### Tips
- If not specified, the output will be placed in the same directory as the input files.
- For best results, use original, unmodified files from your camera
- HEIC conversion is only available on macOS

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

### Examples

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

### Tips
- The `--dir` option takes precedence over the `--photo` and `--video` options, so if you provide `--dir`, you don't need to specify `--photo` and `--video`.
- The script is designed to work primarily with `.JPG` and `.MOV` files. If `.HEIC` files are present, you must use the `--heic` flag on macOS for conversion.


# Performance
This has been tested a bunch between an iPhone 11 Pro, iPhone 16 Pro, and MacBook Pro M1. 

| Files | HEIC Conversion | Time (s) | Error Rate (%) |
|-------|-----------------|----------|----------------|
| 1809  | Yes             | 230      | 0%             |
| 1809  | Yes             | 208      | 0%             |

**Note**: Based on my own testing, the only errors encountered are on the edge case where
a video doesn't have a ContentIdentifier, and the CreateDate has rolled over into the next day
due to some offset that Apple uses from the video and photo.

This problem only occurs for .HEIC photos taken on iPhone 16 Pro, 
and has likely been fixed by Apple, but I am not sure. 
