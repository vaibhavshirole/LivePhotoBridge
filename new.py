import argparse
import os
import shutil
import subprocess

from os.path import exists, basename, isdir

import getexif       # script to get exif data using exiftool

"""
Validate inputs
"""
def validate_directory(dir):
    if not exists(dir):
        print("Path doesn't exist: {}".format(dir))
        return -1
    if not isdir(dir):
        print("Path is not a directory: {}".format(dir))
        return -1
    return

def validate_media(photo_path, video_path):
    """
    Checks if the files provided are valid inputs. Currently the only supported inputs are MP4/MOV and JPEG filetypes.
    Currently it only checks file extensions instead of actually checking file formats via file signature bytes.
    :param photo_path: path to the photo file
    :param video_path: path to the video file
    :return: True if photo and video files are valid, else False
    """
    if not exists(photo_path):
        print("Photo does not exist: {}".format(photo_path))
        return False
    if not exists(video_path):
        print("Video does not exist: {}".format(video_path))
        return False
    if not photo_path.lower().endswith(('.jpg', '.jpeg')):
        print("Photo isn't a JPEG. Run with --heic to convert: {}".format(photo_path))
        return False
    if not video_path.lower().endswith(('.mov', '.mp4')):
        print("Video isn't a MOV or MP4: {}".format(photo_path))
        return False
    return True


"""
Create directories
"""
def create_livephoto_dir(input_path):
    # Create the 'livephoto' directory if it doesn't exist
    livephoto = os.path.join(input_path, "livephoto")
    os.makedirs(livephoto, exist_ok=True)
    print(livephoto)

    jpgfiles = [os.path.join(root, name)
            for root, dirs, files in os.walk(input_path)
            for name in files
            if name.endswith((".JPG", ".MP4"))]
    
    #print(jpgfiles)
            
    for filepath in jpgfiles:
        # Get the filename and extension from the filepath
        filename, extension = os.path.splitext(os.path.basename(filepath))
        dest_path = os.path.join(livephoto, os.path.basename(filepath))
        
        # Check if the file already exists in the destination
        counter = 1
        while os.path.exists(dest_path):
            # If it exists, append a counter to the filename
            new_filename = f"{filename}_{counter}{extension}"
            dest_path = os.path.join(livephoto, new_filename)
            counter += 1

        # Move the file to the 'jpg' directory with the new name
        shutil.move(filepath, dest_path)
    
    return livephoto

def create_media_dir(input_path):
    # Create the 'media' directory if it doesn't exist
    media = os.path.join(input_path, "media")
    os.makedirs(media, exist_ok=True)
    print(media)

    mediafiles = [os.path.join(root, name)
            for root, dirs, files in os.walk(input_path)
            for name in files
            if name.endswith((".jpg", ".jpeg", ".JPEG", ".png", ".PNG", ".gif", ".GIF", ".mov", ".MOV", ".mp4"))]
    
    #print(mediafiles)
            
    for filepath in mediafiles:
        # Get the filename and extension from the filepath
        filename, extension = os.path.splitext(os.path.basename(filepath))
        dest_path = os.path.join(media, os.path.basename(filepath))
        
        # Check if the file already exists in the destination
        counter = 1
        while os.path.exists(dest_path):
            # If it exists, append a counter to the filename
            new_filename = f"{filename}_{counter}{extension}"
            dest_path = os.path.join(media, new_filename)
            counter += 1

        # Move the file to the 'jpg' directory with the new name
        shutil.move(filepath, dest_path)

    return media

def create_other_dir(input_path):
    # Create the 'other' directory if it doesn't exist
    other = os.path.join(input_path, "other")
    os.makedirs(other, exist_ok=True)
    print(other)

    # List all files that do not match the specified extensions
    excluded_extensions = (".jpg", ".jpeg", ".JPEG", ".png", ".PNG", ".gif", ".GIF", ".mov", ".MOV", ".mp4", ".JPG", ".MP4")
    otherfiles = [os.path.join(root, name)
                  for root, dirs, files in os.walk(input_path)
                  for name in files
                  if not name.endswith(excluded_extensions)]
    
    #print(otherfiles)
            
    for filepath in otherfiles:
        # Get the filename and extension from the filepath
        filename, extension = os.path.splitext(os.path.basename(filepath))
        dest_path = os.path.join(other, os.path.basename(filepath))
        
        # Check if the file already exists in the destination
        counter = 1
        while os.path.exists(dest_path):
            # If it exists, append a counter to the filename
            new_filename = f"{filename}_{counter}{extension}"
            dest_path = os.path.join(other, new_filename)
            counter += 1

        # Move the file to the 'other' directory with the new name
        shutil.move(filepath, dest_path)

    return other


"""
Helpers
"""
def delete_file(file_path):
    try:
        os.remove(file_path)
        print(f"Deleted {file_path}")
    except OSError as e:
        print(f"Error deleting {file_path}: {e.strerror}")

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


"""
MOTION PHOTO SCIENCE
"""
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

# search through folder and sort files into separate folders
#   - keep all .JPG, .HEIC, and .MOV together
#   - sort the rest of the media types into "/media"
#   - sort the junk into "/other"

# convert all .HEIC to .JPG
#   - .JPG is what apple saves as photos (no guarantee of live)
#   - .MP4 is what apple saves as livephotovideo
#   - .MOV is what apple saves as regular videos
#   - .jpg is what telegram and random other compressed photos are 

# search through all .JPG for content id 

# MAKE SURE TO DELETE .MP4 THAT GET PAIRED UP! DO NOT DELETE ALL MP4!  

# combine files with same contentid and return name to original filename but with .MP added

# recombine all files into a folder

# eventually create a "careful" mode so that it always checks contentid but it will slow things down a lot
# eventually create a "prune" mode that checks the remaining MOV's contentid to see if it matches with a .MP and deletes it

def main(args):
    outdir = args.output if args.output is not None else "output"

    if args.dir is not None:
        
        if validate_directory(args.dir) is not None:
            exit(1)

        input_path = args.dir

        # Create separate folders to increase success rate
        livephoto_path = create_livephoto_dir(input_path)
        media_path = create_media_dir(input_path)
        other_path = create_other_dir(input_path)

        # Create the 'output' directory if it doesn't exist
        motionphoto_path = os.path.join(input_path, "motionphoto")
        os.makedirs(motionphoto_path, exist_ok=True)
        
        # Create potential matches
        livephoto_pairs = find_livephoto_pairs(livephoto_path)
        for jpg, mp4_list in livephoto_pairs.items():
            print(f"JPG: {jpg}, MP4s: {mp4_list}")

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

        print("Photos without videos:") # These will get moved into the media folder
        for photo in photos_without_videos:
            shutil.move(photo, media_path)
            print(f"Moved {photo} to {media_path}")

        print("\nPhotos with one video:")
        for jpg, mp4 in photos_with_one_video:
            #print(f"JPG: {jpg}, MP4: {mp4}")

            # Convert and merge photo and video into .MP
            convert(jpg, mp4, motionphoto_path)

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
                    # If match found, convert and merge # print(f"Match found: {jpg} and {mp4}")
                    convert(jpg, mp4, motionphoto_path)
                    
                    # Delete the original photo and video
                    delete_file(jpg)
                    delete_file(mp4)
                    matched = True
                    break
            if not matched:
                # If no match, keep separate
                print(f"No matching video found for {jpg}, keeping separate.")
        
        # Rename livephotos folder to reflect that the only thing left are unmatched videos
        new_folder_name = "review_unmatched"
        new_path = os.path.join(os.path.dirname(livephoto_path), new_folder_name)
        os.rename(livephoto_path, new_path)
        
    else:
        if args.photo is None and args.video is None:
            print("Either --dir or --photo and --video are required.")
            exit(1)

        if bool(args.photo) ^ bool(args.video):
            print("Both --photo and --video must be provided.")
            exit(1)

        if validate_media(args.photo, args.video):

            print("Converting all .HEIC to .JPG")
            print("Finished conversion.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Merges a photo and video into a MotionPhoto-formatted Google Motion Photo')
    parser.add_argument('--dir', type=str, help='Process a directory for photos/videos. Takes precedence over '
                                                '--photo/--video')
    #parser.add_argument('--recurse', help='Recursively process a directory. Only applies if --dir is also provided',
    #                    action='store_true')
    parser.add_argument('--photo', type=str, help='Path to the JPEG photo to add (run with --heic to convert .HEIC).')
    parser.add_argument('--video', type=str, help='Path to the MOV video to add.')
    parser.add_argument('--output', type=str, help='Path to where files should be written out to.')

    main(parser.parse_args())
