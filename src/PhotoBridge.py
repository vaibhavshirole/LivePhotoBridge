import os
import json
import subprocess

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

def pair_files(photos, videos):
    """
    Pair photos and videos based on matching ContentIdentifier or fallback criteria.
    Returns a list of tuples (photo, video) for matched pairs.
    """
    paired_files = []
    unmatched_photos = list(photos)  # Copy to keep track of unmatched photos

    for video in videos:
        video_metadata = video['metadata']
        match = None

        # First, try to match by ContentIdentifier
        if video_metadata.get('ContentIdentifier'):
            match = next(
                (p for p in unmatched_photos if p['metadata'].get('ContentIdentifier') == video_metadata['ContentIdentifier']),
                None
            )
        # If no match by ContentIdentifier, try filename and CreateDate
        if not match and video_metadata.get('CreateDate'):
            match = next(
                (
                    p for p in unmatched_photos
                    if os.path.splitext(os.path.basename(p['path']))[0] == os.path.splitext(os.path.basename(video['path']))[0]
                    and p['metadata'].get('CreateDate') == video_metadata['CreateDate']
                ),
                None
            )

        # If a match is found, pair them and remove the photo from unmatched_photos
        if match:
            paired_files.append((match['path'], video['path']))
            unmatched_photos.remove(match)

    return paired_files, unmatched_photos

def process_directory(directory, recurse, output_dir, heic_conversion):
    """
    Process the directory to extract metadata, pair files, and create motion photos.
    """
    # Extract metadata in a single batch
    metadata_by_path = extract_metadata_batch(directory, recurse)

    photos = []
    videos = []

    # Categorize files as photos or videos
    for file_path, metadata in metadata_by_path.items():
        ext = os.path.splitext(file_path)[-1].lower()
        if ext in ['.jpg', '.jpeg', '.heic']:
            photos.append({'path': file_path, 'metadata': metadata})
        elif ext in ['.mov', '.mp4']:
            videos.append({'path': file_path, 'metadata': metadata})

    # Pair files and process
    paired_files, unmatched_photos = pair_files(photos, videos)

    for photo, video in paired_files:
        if create_motion_photo(photo, video, output_dir):
            #os.remove(photo)
            #os.remove(video)
            print("mpphoto: ", photo)
            print("mpvideo: ", video)

    # Save unmatched photos as-is
    for photo in unmatched_photos:
        dest_path = os.path.join(output_dir, os.path.basename(photo['path']))
        # os.rename(photo['path'], dest_path)
        print("unmatched: ", dest_path)
        print(f"Saved unmatched photo: {dest_path}")

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

    # If photo is .heic, then still return a successful conversion but just copy the HEIC over

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
