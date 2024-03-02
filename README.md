ApplePhotoMuxer
================
Convert Apple Live Photos into Google Motion Photos. This version is made specifically for macOS because I wanted to make sure there is .HEIC support. Linux and Windows support is completely possible but I'm not good enough with Python to release a stable build.

> This is a fork of MotionPhotoMuxer found [here](https://github.com/mihir-io/MotionPhotoMuxer)
> 
> As described in the credits of MotionPhotoMuxer, this wouldn't have been possible without the excellent writeup on the process of working with Motion Photos [here](https://medium.com/android-news/working-with-motion-photos-da0aa49b50c).
>
> Also, I got py3env2 working with help found [here](https://stackoverflow.com/a/72088586) in case anyone gets stuck :)

# Installation

### Prerequisites
* homebrew
* python
* pip

Start by installing libraries necessary for py3exiv2
~~~bash
brew install exiv2 boost boost-python3
~~~

***[This step is only for Apple Silicon]*** Open your config file (I use zsh) and add the following exports 
~~~bash
open ./zshrc
~~~

* (make sure the 4 version numbers in the exports below match yours. you can find version numbers in /opt/homebrew/ )
```
export CPLUS_INCLUDE_PATH=/opt/homebrew/Cellar/exiv2/𝟎.𝟐𝟕.𝟓_𝟏/include/:/opt/homebrew/opt/libssh/include/:/opt/homebrew/Cellar/boost/𝟏.𝟕𝟖.𝟎_𝟏/include/

export LDFLAGS="-L/opt/homebrew/Cellar/boost-python3/𝟏.𝟕𝟖.𝟎/lib -L/opt/homebrew/Cellar/exiv2/𝟎.𝟐𝟕.𝟓_𝟏/lib"
```

Now, you can pip install py3exiv2 from /dep
~~~bash
pip3 install py3exiv2-0.12.0.tar.gz
~~~

# Usage
## GUI
> under construction

## CLI
~~~
usage: MotionPhotoMuxer.py [-h] [--verbose] [--dir DIR] [--recurse] [--photo PHOTO] [--video VIDEO] [--output OUTPUT] [--copyall]

Merges a photo and video into a Microvideo-formatted Google Motion Photo

options:
  -h, --help       show this help message and exit
  --verbose        Show logging messages.
  --dir DIR        Process a directory for photos/videos. Takes precedence over --photo/--video
  --recurse        Recursively process a directory. Only applies if --dir is also provided
  --photo PHOTO    Path to the JPEG photo to add.
  --video VIDEO    Path to the MOV video to add.
  --output OUTPUT  Path to where files should be written out to.
  --copyall        Copy unpaired files to directory.
~~~


This will convert any HEIC or PNG to JPG when run, 
as the muxer requires a JPEG photo and MOV or MP4 video. The code only does simple
error checking to see if the file extensions are `.jpg|.jpeg` and `.mov|.mp4`
respectively, so if the actual photo/video encoding is something funky, things
may not work right.

> **Note**
> The output motion photo tends to work more reliably in my experience if the input video is H.264 rather than HEVC.

This has been tested a bunch between an iPhone 11 Pro, MacBook Pro M1, and Pixel 3a. 
But, as was said in the original work, the testing is really just on my own stuff
and might not work for you, so make backups! 
