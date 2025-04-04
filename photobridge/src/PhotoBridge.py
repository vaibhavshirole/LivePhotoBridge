import os
import json
import re
import subprocess
import sys
from collections import defaultdict

import macos_heic_to_jpg

def emit_progress(message, percentage):
    """Emit a progress message that can be caught by the Electron app"""
    progress_data = {
        "type": "progress",
        "message": message,
        "percentage": percentage
    }
    print(json.dumps(progress_data))
    sys.stdout.flush()


def emit_log(message):
    """Emit a log message that can be caught by the Electron app"""
    log_data = {
        "type": "log",
        "message": message
    }
    print(json.dumps(log_data))
    sys.stdout.flush()


def extract_metadata_batch(directory, recurse=False):
    """
    Extract metadata for all files in a directory using ExifTool in a single batch.
    Returns a dictionary keyed by file path with metadata for each file.
    """

    # Get the directory of the current script
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Define the relative path to exiftool files
    exiftool_exec_path = os.path.join(script_dir, '../exiftool/exiftool')

    exiftool_pull_data = [
        exiftool_exec_path,
        "-json",
        "-FilePath",
        "-FileName",
        "-BaseName",
        "-ContentIdentifier",
        "-CreateDate",
        "-LivePhotoVideoIndex",
        "-RuntimeScale",
    ]
    if recurse:
        exiftool_pull_data.append("-r")
    exiftool_pull_data.append(directory)

    result = subprocess.run(exiftool_pull_data, capture_output=True, text=True)
    exif_data = json.loads(result.stdout)

    # Organize metadata by file path
    metadata_by_path = {item["FilePath"]: item for item in exif_data}
    return metadata_by_path


def group_files_by_contentidentifier(files):
    """
    Group photos and videos by ContentIdentifier, or fallback to matching by filename and date if necessary.
    Returns a dictionary where keys are ContentIdentifiers or date-based keys and values are lists of file paths (photos/videos).
    """
    groups = defaultdict(list)
    
    # Store photos separately for matching in fallback case
    photos = [file for file in files if file['type'] == 'photo']
    
    for file in files:
        content_identifier = file['metadata'].get('ContentIdentifier')
        
        if content_identifier:
            # If the file has a content identifier, group by it
            groups[content_identifier].append(file)
        else:
            # Fallback: Video without content identifier, try matching by filename + date
            if file['type'] == 'video':
                # Try to find a matching photo by filename
                video_filename = os.path.splitext(os.path.basename(file['path']))[0]
                
                # Modify this to exclude photos whose filenames don't match the pattern
                # ex. IMG_1001, IMG_1001_1, etc. are matches. IMG_E1001 is not
                matching_photos = [photo for photo in photos 
                                   if re.match(r'^{0}(_\d+)?$'.format(re.escape(video_filename)), 
                                               os.path.splitext(os.path.basename(photo['path']))[0])]
                
                for photo in matching_photos:
                    # Check if the CreateDates match (compare only the date part)
                    video_create_date = file['metadata'].get('CreateDate')
                    photo_create_date = photo['metadata'].get('CreateDate')
                    
                    if video_create_date and photo_create_date:
                        video_date = video_create_date.split()[0]  # Extract the date part
                        photo_date = photo_create_date.split()[0]  # Extract the date part
                        
                        if video_date == photo_date:
                            # If dates match, treat them as a pair
                            groups[photo['metadata']['ContentIdentifier']].append(file)
                            break
                
                if not matching_photos:
                    groups['unmatched_videos'].append(file)

            else:
                # If no identifier and not a video, just group by date and filename (fallback case)
                create_date = file['metadata'].get('CreateDate')
                if create_date:
                    date_part = create_date.split()[0]  # Get the date part (YYYY:MM:DD)
                    groups[date_part, os.path.splitext(os.path.basename(file['path']))[0]].append(file)
                else:
                    groups['no_identifier'].append(file)
    
    return groups


def process_directory(directory, recurse, output_dir, heic_conversion):
    """
    Process the directory to extract metadata, group files, pair files, and create motion photos.
    """
    emit_progress("Extracting metadata...", 10)
    metadata_by_path = extract_metadata_batch(directory, recurse)

    emit_progress("Processing files...", 20)
    files = []
    for file_path, metadata in metadata_by_path.items():
        ext = os.path.splitext(file_path)[-1].lower()
        if ext in ['.jpg', '.jpeg', '.png', '.heic']:
            files.append({'path': file_path, 'metadata': metadata, 'type': 'photo'})
        elif ext in ['.mov', '.mp4']:
            files.append({'path': file_path, 'metadata': metadata, 'type': 'video'})

    emit_progress("Grouping files...", 40)
    groups = group_files_by_contentidentifier(files)

    total_groups = len(groups)
    processed_groups = 0

    for group_key, group_files in groups.items():
        if group_key == 'unmatched_videos':
            continue

        processed_groups += 1
        progress = 40 + (processed_groups / total_groups * 50)
        emit_progress(f"Processing group {processed_groups} of {total_groups}...", progress)

        photos = [f for f in group_files if f['type'] == 'photo']
        videos = [f for f in group_files if f['type'] == 'video']

        if photos and videos:
            photo = photos[0]
            video = videos[0]
            if create_motion_photo(photo['path'], video['path'], photo['metadata'], output_dir):
                for file in group_files:
                    os.remove(file['path'])
        else:
            for file in group_files:
                dest_path = os.path.join(output_dir, os.path.basename(file['path']))
                os.rename(file['path'], dest_path)
                emit_log(f"Moved unmatched photo to: {dest_path}")

    emit_progress("Processing unmatched files...", 95)
    unmatched_videos = groups.get('unmatched_videos', [])
    for video in unmatched_videos:
        dest_path = os.path.join(output_dir, os.path.basename(video['path']))
        os.rename(video['path'], dest_path)
        emit_log(f"Moved unmatched video to: {dest_path}")

    emit_progress("Complete!", 100)


def process_individual_files(photo_path, video_path, output_dir):
    """
    Process individual photo and video files.
    """
    # Extract metadata for both files
    photo_metadata = extract_metadata_batch(photo_path)  # Extract metadata for the photo
    video_metadata = extract_metadata_batch(video_path)  # Extract metadata for the video

    files = []
    for file_path, metadata in photo_metadata.items():
        files.append({'path': file_path, 'metadata': metadata, 'type': 'photo'})
    for file_path, metadata in video_metadata.items():
        files.append({'path': file_path, 'metadata': metadata, 'type': 'video'})

    groups = group_files_by_contentidentifier(files)

    # Process each group
    for group_key, group_files in groups.items():
        photos = [f for f in group_files if f['type'] == 'photo']
        videos = [f for f in group_files if f['type'] == 'video']

        if photos and videos:
            # Pick the first photo and first video as the pair
            photo = photos[0]
            video = videos[0]

            # Create motion photo
            if create_motion_photo(photo['path'], video['path'], photo['metadata'], output_dir):
                # Delete all photos and videos in the group after creating motion photo
                for file in group_files:
                    os.remove(file['path'])

        else:
            # If no matching video/photo pair, save unmatched files as-is
            for file in group_files:
                dest_path = os.path.join(output_dir, os.path.basename(file['path']))
                os.rename(file['path'], dest_path)
                print(f"Saved file: {dest_path}")


def add_xmp_metadata(photo_metadata, motion_photo_path, video_offset):
    """Adds XMP metadata to the merged image indicating the byte offset in the file where the video begins.
    :param merged_file: The path to the file that has the photo and video merged together.
    :param offset: The number of bytes from EOF to the beginning of the video.
    :return: None
    """
    print(f"Adding metadata for {os.path.basename(motion_photo_path)}")

    LivePhotoVideoIndex = int(photo_metadata["LivePhotoVideoIndex"])
    RunTimeScale = int(photo_metadata["RunTimeScale"])
    MicroVideoPresentationTimestampUs = int((LivePhotoVideoIndex/RunTimeScale)*1000000)

    # Get the directory of the current script
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Define the relative path to exiftool files
    config_file_path = os.path.join(script_dir, '../exiftool/google_camera.config')
    exiftool_exec_path = os.path.join(script_dir, '../exiftool/exiftool')

    # Define the ExifTool command to add MicroVideo properties (Haven't figured out MotionPhoto yet)
    exiftool_add_microvideo = [
        exiftool_exec_path, 
        '-config', config_file_path, 
        '-overwrite_original', 
        '-m',
        '-q',
        '-XMP-GCamera:MicroVideo=1', 
        '-XMP-GCamera:MicroVideoVersion=1', 
        '-XMP-GCamera:MicroVideoOffset=' + str(video_offset) + '', 
        '-XMP-GCamera:MicroVideoPresentationTimestampUs=' + str(MicroVideoPresentationTimestampUs) + '', 
        motion_photo_path
    ]
    try:
        # TODO: If I don't capture output, it will explain that .HEIC is failing. 
        #       Currently don't know how to get this to work for .HEIC so I'm not 
        #       returning error and just letting the .HEIC get remade in output_dir
        #       which actually is the intended behavior. Could just do without the 
        #       fact that it's working thanks to an error. :(
        subprocess.run(exiftool_add_microvideo, capture_output=True, text=True)
    except Exception as e:
        print("Error: Couldn't add metadata.", e)

    return


def create_motion_photo(photo_path, video_path, metadata, output_dir):
    """
    Create a motion photo from the provided photo and video paths.
    Save the result in the output directory and return True if successful.
    """
    # print(f"Creating motion photo...")
    
    try:
        # Extract filename and extension
        base_name, extension = os.path.splitext(os.path.basename(photo_path))

        # Check if the photo extension is not .heic and block .HEIC from getting .MP
        if extension.lower() != ".heic":
            base_name += ".MP" 
        
        # Construct the motion photo path
        motion_photo_path = os.path.join(output_dir, f"{base_name}{extension}")
        os.makedirs(os.path.dirname(motion_photo_path), exist_ok=True)

        # Combine the photo and video into the motion photo
        with open(motion_photo_path, "wb") as outfile, open(photo_path, "rb") as photo, open(video_path, "rb") as video:
            outfile.write(photo.read())
            outfile.write(video.read())
        
        # The 'offset' field in the XMP metadata should be the offset (in bytes) 
        # from the end of the file to the part where the video portion of the merged file begins. 
        # In other words, merged size - photo_only_size = offset.
        photo_filesize = os.path.getsize(photo_path)
        motion_photo_filesize = os.path.getsize(motion_photo_path)
        offset_in_bytes = motion_photo_filesize - photo_filesize

        add_xmp_metadata(metadata, motion_photo_path, offset_in_bytes)

        # print("Created successfully.")
        return True
    except Exception as e:
        print("Error: Motion Photo could not be made.", e)
        return False


def main(args):
    # Check if --output directory exists, if not, create it
    if args.output:
        if not os.path.isdir(args.output):
            print(f"Output directory '{args.output}' does not exist. Creating it now...")
            os.makedirs(args.output)  # Create the directory if it doesn't exist
            print(f"Directory '{args.output}' created successfully.")


    if args.dir:
        # Check if the directory exists
        if not os.path.isdir(args.dir):
            print(f"Error: The directory '{args.dir}' does not exist or is not a valid directory.")
            exit(1)

        # Check if the directory is empty of files (ignoring subdirectories)
        files_in_dir = [f for f in os.listdir(args.dir) if os.path.isfile(os.path.join(args.dir, f))]
        if not files_in_dir:  # If the list of files is empty
            print(f"Error: The directory '{args.dir}' does not contain any files.")
            exit(1)

        if args.heic:
            print("Converting .HEIC to .JPG")
            macos_heic_to_jpg.check_directory_for_duplicates(args.dir, args.recurse)
            macos_heic_to_jpg.convert_directory(args.dir)

        process_directory(args.dir, args.recurse, args.output or args.dir, args.heic)

    elif args.photo and args.video:
        # Check if the photo file exists
        if not os.path.isfile(args.photo):
            print(f"Error: The photo file '{args.photo}' does not exist or is not a valid file.")
            exit(1)
        
        # Check if the video file exists
        if not os.path.isfile(args.video):
            print(f"Error: The video file '{args.video}' does not exist or is not a valid file.")
            exit(1)

        if args.heic and args.photo.lower().endswith('.heic'):
            print("Converting .HEIC to .JPG")
            photo_path = macos_heic_to_jpg.convert_file(args.photo)
        else:
            photo_path = args.photo

        process_individual_files(photo_path, args.video, args.output or os.path.dirname(args.photo))

    else:
        print("Error: You must provide either --dir or both --photo and --video.")
        exit(1)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(
        description='Merges a photo and video into a MotionPhoto-formatted Google Motion Photo'
    )
    parser.add_argument('--dir', type=str, help='Process a directory for photos/videos. Takes precedence over --photo/--video.')
    parser.add_argument('--photo', type=str, help='Path to the JPEG photo to add.')
    parser.add_argument('--video', type=str, help='Path to the MOV video to add.')
    parser.add_argument('--output', type=str, help='Path to where files should be written out to. Defaults to --dir')
    parser.add_argument('--recurse', help='Recursively process a directory. Only applies if --dir is also provided.', action='store_true')
    parser.add_argument('--heic', help='Convert all .HEIC to .JPG (macOS only).', action='store_true')

    main(parser.parse_args())
