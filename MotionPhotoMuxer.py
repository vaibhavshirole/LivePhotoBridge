import argparse
import logging
import os
import shutil
import sys
import subprocess
from os.path import exists, basename, isdir

import getexif       # script to get exif data using exiftool
import MacConverter  # use sips to convert heic to jpg

def validate_directory(dir):
    if not exists(dir):
        logging.error("Path doesn't exist: {}".format(dir))
        exit(1)
    if not isdir(dir):
        logging.error("Path is not a directory: {}".format(dir))
        exit(1)

def validate_media(photo_path, video_path):
    """
    Checks if the files provided are valid inputs. Currently the only supported inputs are MP4/MOV and JPEG filetypes.
    Currently it only checks file extensions instead of actually checking file formats via file signature bytes.
    :param photo_path: path to the photo file
    :param video_path: path to the video file
    :return: True if photo and video files are valid, else False
    """
    if not exists(photo_path):
        logging.error("Photo does not exist: {}".format(photo_path))
        return False
    if not exists(video_path):
        logging.error("Video does not exist: {}".format(video_path))
        return False
    if not photo_path.lower().endswith(('.jpg', '.jpeg')):
        logging.error("Photo isn't a JPEG. Run with --heic to convert: {}".format(photo_path))
        return False
    if not video_path.lower().endswith(('.mov', '.mp4')):
        logging.error("Video isn't a MOV or MP4: {}".format(photo_path))
        return False
    return True

def merge_files(photo_path, video_path, output_path):
    """Merges the photo and video file together by concatenating the video at the end of the photo. Writes the output to
    a temporary folder.
    :param photo_path: Path to the photo
    :param video_path: Path to the video
    :return: File name of the merged output file
    """
    logging.info("Merging {} and {}.".format(photo_path, video_path))
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
        logging.error("Error, adding_xmp_metadata:", e)

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

        logging.info("Adding metadata, video offset: " + str(offset))
        add_xmp_metadata(merged, offset)
        
        logging.info("Adding .MP into filename")
        mp_clarify(merged)

        return True
    except Exception as e:
        logging.error(f"Error during conversion: {e}")
        return False

def matching_video(photo_path, file_dir):
    photo_name = os.path.splitext(os.path.basename(photo_path))[0]
    logging.info("Looking for videos named: {}".format(photo_name))
    
    video_paths = [] # store multiple video paths if doing *careful* recursive search
    video_extensions = ['.MOV', '.MP4']
    for root, dir, files in os.walk(file_dir):
        for file in files:
            if os.path.splitext(file)[0] == photo_name:
                for ext in video_extensions:
                    potential_video_path = os.path.join(root, file.split('.')[0] + ext)

                    if os.path.exists(potential_video_path):
                        video_paths.append(potential_video_path)
    return video_paths

def process_directory(file_dir, recurse):
    """
    Loops through files in the specified directory and generates a list of (photo, video) path tuples that can
    be converted
    :param file_dir: directory to look for photos/videos to convert
    :param recurse: if true, subdirectories will recursively be processes
    :return: a list of tuples containing matched photo/video pairs.
    """
    logging.info("Processing dir: {}".format(file_dir))
    file_pairs = []
    unmatched_images = []

    if recurse:
        for root, dir, files in os.walk(file_dir):  # Check everything with --dir as root
            for file in files:
                photo_path = os.path.join(root, file)

                if os.path.isfile(photo_path) and file.lower().endswith(('.jpg', '.jpeg')):
                    video_paths = matching_video(photo_path, file_dir)
                    logging.info("found video paths: " + str(video_paths))

                    # Receives an array of potential videos, and checks them until it finds a matching ContentIdentifier
                    if video_paths:
                        photo_content_identifier = getexif.get_content_identifier(photo_path)                        
                        match_found = False  # Flag to track if a match was found
                        
                        for video_path in video_paths:
                            video_content_identifier = getexif.get_content_identifier(video_path)

                            if photo_content_identifier is not None and \
                                video_content_identifier is not None and \
                                photo_content_identifier == video_content_identifier:
                                    file_pairs.append((photo_path, video_path))
                                    match_found = True
                                    break  # No need to continue checking other videos

                        if not match_found:
                            unmatched_images.append(photo_path)
                    else:
                        unmatched_images.append(photo_path)
    else:
        processed_photos = set()  # Set to store processed photo paths

        for file in os.listdir(file_dir):
            photo_path = os.path.join(file_dir, file)
            
            if os.path.isfile(photo_path) and file.lower().endswith(('.jpg', '.jpeg')):
                video_paths = matching_video(photo_path, file_dir)

                if video_paths:
                    for video_path in video_paths:
                        # Check if photo path is already processed
                        if photo_path not in processed_photos:
                            file_pairs.append((photo_path, video_path))
                            processed_photos.add(photo_path)
                else:
                    unmatched_images.append(photo_path)

    logging.info("Found {} pairs.".format(len(file_pairs)))
    logging.info("subset of found image/video pairs: {}".format(str(file_pairs[0:9])))

    return file_pairs

def main(args):
    logging_level = logging.INFO if args.verbose else logging.ERROR
    logging.basicConfig(level=logging_level, stream=sys.stdout)
    logging.info("Enabled verbose logging")

    outdir = args.output if args.output is not None else "output"

    if args.dir is not None:
        validate_directory(args.dir)

        if args.heic:
            logging.info("Converting all .HEIC to .JPG")
            MacConverter.convert_directory(args.dir)
            logging.info("Finished conversion.")
        
        pairs = process_directory(args.dir, args.recurse)
        processed_files = set() # holds all the photo+video pairs that match
        for pair in pairs:
            if validate_media(pair[0], pair[1]):
                convert(pair[0], pair[1], outdir)
                processed_files.add(pair[0])
                processed_files.add(pair[1])

        if args.copyall:
            # Walk the directory tree and gather all file paths
            all_files = set()
            for dirpath, _, filenames in os.walk(args.dir):
                for filename in filenames:
                    all_files.add(os.path.join(dirpath, filename))

            # Subtract the processed files to get the remaining files
            remaining_files = all_files - processed_files

            logging.info("Found {} remaining files that will be copied.".format(len(remaining_files)))

            if len(remaining_files) > 0:
                # Ensure the destination directory exists
                os.makedirs(outdir, exist_ok=True)
                
                for file in remaining_files:
                    if os.path.isfile(file):  # Check if the path is a file
                        file_name = os.path.basename(file)
                        destination_path = os.path.join(outdir, file_name)
                        shutil.copy2(file, destination_path)
                        logging.info("Copied file: " + str(file))
    else:
        if args.photo is None and args.video is None:
            logging.error("Either --dir or --photo and --video are required.")
            exit(1)

        if bool(args.photo) ^ bool(args.video):
            logging.error("Both --photo and --video must be provided.")
            exit(1)

        if validate_media(args.photo, args.video):
            if args.heic:
                logging.info("Converting all .HEIC to .JPG")
                MacConverter.convert_file(args.photo)
                logging.info("Finished conversion.")

            convert(args.photo, args.video, outdir)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Merges a photo and video into a MotionPhoto-formatted Google Motion Photo')
    parser.add_argument('--verbose', help='Show logging messages.', action='store_true')
    parser.add_argument('--dir', type=str, help='Process a directory for photos/videos. Takes precedence over '
                                                '--photo/--video')
    parser.add_argument('--recurse', help='Recursively process a directory. Only applies if --dir is also provided',
                        action='store_true')
    parser.add_argument('--photo', type=str, help='Path to the JPEG photo to add (run with --heic to convert .HEIC).')
    parser.add_argument('--video', type=str, help='Path to the MOV video to add.')
    parser.add_argument('--output', type=str, help='Path to where files should be written out to.')
    parser.add_argument('--copyall', help='Copy unpaired files to directory.', action='store_true')
    parser.add_argument('--heic', help='Convert all .HEIC to .JPG (macOS only)', action='store_true')

    main(parser.parse_args())
