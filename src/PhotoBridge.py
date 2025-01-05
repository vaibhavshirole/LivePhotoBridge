import os
import json
import subprocess
from collections import defaultdict

def extract_metadata_batch(directory, recurse=False):
    """
    Extract metadata for all files in a directory using ExifTool in a single batch.
    Returns a dictionary keyed by file path with metadata for each file.
    """
    exiftool_pull_data = [
        "exiftool",
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
                matching_photos = [photo for photo in photos if os.path.splitext(os.path.basename(photo['path']))[0] == video_filename]
                
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
    # Extract metadata in a single batch
    metadata_by_path = extract_metadata_batch(directory, recurse)

    files = []
    for file_path, metadata in metadata_by_path.items():
        ext = os.path.splitext(file_path)[-1].lower()
        if ext in ['.jpg', '.jpeg', '.heic']:
            files.append({'path': file_path, 'metadata': metadata, 'type': 'photo'})
        elif ext in ['.mov', '.mp4']:
            files.append({'path': file_path, 'metadata': metadata, 'type': 'video'})

    # Group files by ContentIdentifier
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
            if create_motion_photo(photo['path'], video['path'], output_dir):
                # Delete all photos and videos in the group after creating motion photo
                for file in group_files:
                    os.remove(file['path'])

        else:
            # If no matching video/photo pair, save unmatched files as-is
            for file in group_files:
                dest_path = os.path.join(output_dir, os.path.basename(file['path']))
                os.rename(file['path'], dest_path)
                print(f"Saved file: {dest_path}")

def process_individual_files(photo_path, video_path, output_dir):
    """
    Process individual photo and video files.
    """
    # Metadata extraction for individual files
    metadata = extract_metadata_batch(os.path.dirname(photo_path))
    photo_metadata = metadata.get(photo_path)
    video_metadata = metadata.get(video_path)

    if not photo_metadata or not video_metadata:
        print("Error: Could not extract metadata from one or both files.")
        return

    # Match by ContentIdentifier or fallback criteria
    if (
        photo_metadata.get('ContentIdentifier') == video_metadata.get('ContentIdentifier')
        or (photo_metadata.get('CreateDate') == video_metadata.get('CreateDate')
            and os.path.splitext(os.path.basename(photo_path))[0] == os.path.splitext(os.path.basename(video_path))[0])
    ):
        if create_motion_photo(photo_path, video_path, output_dir):
            os.remove(photo_path)
            os.remove(video_path)
        else:
            print("Failed to create motion photo.")
    else:
        print("Photo and video do not match. Saving photo as-is.")
        dest_path = os.path.join(output_dir, os.path.basename(photo_path))
        os.rename(photo_path, dest_path)
        print(f"Saved photo: {dest_path}")

def create_motion_photo(photo_path, video_path, output_dir):
    """
    Create a motion photo from the provided photo and video paths.
    Save the result in the output directory and return True if successful.
    """
    # Placeholder: Implement motion photo creation logic.
    print(f"Creating motion photo from {photo_path} and {video_path}")
    return True  # Simulating success for now

def main(args):
    if args.dir:
        process_directory(args.dir, args.recurse, args.output or args.dir, args.heic)
    elif args.photo and args.video:
        process_individual_files(args.photo, args.video, args.output or os.path.dirname(args.photo))
    else:
        print("Error: You must provide either --dir or both --photo and --video.")
        exit(1)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(
        description='Merges a photo and video into a MotionPhoto-formatted Google Motion Photo'
    )
    parser.add_argument('--dir', type=str, help='Process a directory for photos/videos. Takes precedence over --photo/--video.')
    parser.add_argument('--recurse', help='Recursively process a directory. Only applies if --dir is also provided.', action='store_true')
    parser.add_argument('--photo', type=str, help='Path to the JPEG photo to add.')
    parser.add_argument('--video', type=str, help='Path to the MOV video to add.')
    parser.add_argument('--output', type=str, help='Path to where files should be written out to.')
    parser.add_argument('--heic', help='Convert all .HEIC to .JPG (macOS only).', action='store_true')

    main(parser.parse_args())
