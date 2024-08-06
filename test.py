import argparse
import os
import shutil
import re
import subprocess

from os.path import exists, basename, isdir

import getexif       # script to get exif data using exiftool

def get_filename(input_path):
    filename = os.path.basename(input_path)
    # Check if there's more than one underscore in the filename
    if filename.count('_') > 1:
        base_name, _, _ = filename.rpartition('_')
    else:
        base_name = os.path.splitext(filename)[0]  # Use the entire name without extension if only one underscore
    return base_name

# Function to find and list pairs of JPG and MP4 files
def find_livephoto_pairs(livephoto_path):
    jpg_files = []
    mp4_files = []
    
    # Walk through the directory to list JPG and MP4 files
    for root, dirs, files in os.walk(livephoto_path):
        for name in files:
            if name.lower().endswith(".jpg"):
                jpg_files.append(os.path.join(root, name))
            elif name.lower().endswith(".mp4"):
                mp4_files.append(os.path.join(root, name))

    # Dictionary to store JPG files and their potential MP4 matches
    pairs = {}

    for jpg_path in jpg_files:
        # Get the base name from the JPG file
        jpg_base_name = get_filename(jpg_path)
        # Initialize an empty list to store potential matches for this JPG
        pairs[jpg_path] = []

        # Look for MP4 files with the same base name
        for mp4_path in mp4_files:
            mp4_base_name = get_filename(mp4_path)

            if mp4_base_name.lower() == jpg_base_name.lower():
                pairs[jpg_path].append(mp4_path)

    return pairs

def merge_files(photo_path, video_path, output_path):
    """Merges the photo and video file together by concatenating the video at the end of the photo. Writes the output to
    a temporary folder.
    :param photo_path: Path to the photo
    :param video_path: Path to the video
    :return: File name of the merged output file
    """
    print("Merging {} and {}.".format(photo_path, video_path))
    out_path = os.path.join(output_path, "{}".format(basename(photo_path)))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as outfile, open(photo_path, "rb") as photo, open(video_path, "rb") as video:
        outfile.write(photo.read())
        outfile.write(video.read())
    return out_path

def add_xmp_metadata(merged_file, offset):
    """Adds XMP metadata to the merged image indicating the byte offset in the file where the video begins.
    :param merged_file: The path to the file that has the photo and video merged together.
    :param offset: The number of bytes from EOF to the beginning of the video.
    :return: None
    """
    metadata = getexif.get_metadata_fields(merged_file)
    LivePhotoVideoIndex = int(metadata.get('Live Photo Video Index'))
    RunTimeScale = int(metadata.get('Run Time Scale'))
    MicroVideoPresentationTimestampUs = int((LivePhotoVideoIndex/RunTimeScale)*1000000)

    # Define the ExifTool command to add MotionPhoto properties
    exiftool_cmd = [
        'exiftool', 
        '-config', '/Users/vaibhav/Developer/projects/PhotoMuxer/exiftool/google_camera.config', 
        '-overwrite_original', 
        '-m',
        '-q',
        '-XMP-GCamera:MicroVideo=1', 
        '-XMP-GCamera:MicroVideoVersion=1', 
        '-XMP-GCamera:MicroVideoOffset=' + str(offset) + '', 
        '-XMP-GCamera:MicroVideoPresentationTimestampUs=' + str(MicroVideoPresentationTimestampUs) + '', 
        merged_file
    ]
    try:
        subprocess.run(exiftool_cmd)
    except subprocess.CalledProcessError as e:
        print("Error, adding_xmp_metadata:", e)

    return

def mp_clarify(file_path):
    # Split the file path into directory, base name, and extension
    directory, filename = os.path.split(file_path)
    basename, extension = os.path.splitext(filename)
    
    # Add .MP to the base name
    new_filename = f"{basename}.MP{extension}"
    
    # Reconstruct the full file path
    new_file_path = os.path.join(directory, new_filename)
    
    os.rename(file_path, new_file_path)
    return new_file_path

def convert(photo_path, video_path, output_path):
    """
    Performs the conversion process to mux the files together into a Google Motion Photo.
    :param photo_path: path to the photo to merge
    :param video_path: path to the video to merge
    :return: True if conversion was successful, else False
    """
    try:
        merged = merge_files(photo_path, video_path, output_path)
        photo_filesize = os.path.getsize(photo_path)
        merged_filesize = os.path.getsize(merged)

        # The 'offset' field in the XMP metadata should be the offset (in bytes) from the end of the file to the part
        # where the video portion of the merged file begins. In other words, merged size - photo_only_size = offset.
        offset = merged_filesize - photo_filesize

        print("Adding metadata, video offset: " + str(offset))
        add_xmp_metadata(merged, offset)
        
        print("Adding .MP into filename")
        mp_clarify(merged)

        return True
    except Exception as e:
        print(f"Error during conversion: {e}")
        return False

def delete_file(file_path):
    try:
        os.remove(file_path)
        print(f"Deleted {file_path}")
    except OSError as e:
        print(f"Error deleting {file_path}: {e.strerror}")

outdir = "output"

# Create potential matches
livephoto_path = "/Users/vaibhav/Downloads/testing-ground/playground/livephoto"
livephoto_pairs = find_livephoto_pairs(livephoto_path)

# Initialize lists for different cases
photos_without_videos = []
photos_with_one_video = []
photos_with_multiple_videos = []

# Categorize JPG files based on the number of associated MP4 files
for jpg, mp4_list in livephoto_pairs.items():
    if not mp4_list:
        photos_without_videos.append(jpg)                   # No associated videos
    elif len(mp4_list) == 1:
        photos_with_one_video.append((jpg, mp4_list[0]))    # One associated video
    else:
        photos_with_multiple_videos.append((jpg, mp4_list)) # Multiple associated videos, check ContentIdentifier attrib.

# Print the results for verification
print("Photos without videos:")
for photo in photos_without_videos:
    print(f"JPG: {photo}")
    # don't do anything

print("\nPhotos with one video:")
for jpg, mp4 in photos_with_one_video:
    #print(f"JPG: {jpg}, MP4: {mp4}")

    # Convert and merge photo and video into .MP
    convert(jpg, mp4, outdir)

    # Delete the original photo and video
    delete_file(jpg)
    delete_file(mp4)

print("\nPhotos with multiple videos:")
for jpg, mp4_list in photos_with_multiple_videos:
    #print(f"JPG: {jpg}, MP4s: {mp4_list}")

    # Check content ID of photo against videos
    photo_content_id = getexif.get_content_identifier(jpg)
    matched = False
    for mp4 in mp4_list:
        video_content_id = getexif.get_content_identifier(mp4)
        if photo_content_id == video_content_id:
            # If match found, convert and merge
            #print(f"Match found: {jpg} and {mp4}")
            convert(jpg, mp4, outdir)
            # Delete the original photo and video
            delete_file(jpg)
            delete_file(mp4)
            matched = True
            break
    if not matched:
        # If no match, keep separate (optional: move to a separate directory)
        print(f"No matching video found for {jpg}, keeping separate.")