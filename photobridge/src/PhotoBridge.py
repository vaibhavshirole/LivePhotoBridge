import os
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
import macos_heic_to_jpg

def emit_progress(message: str, percentage: float):
    print(json.dumps({"type": "progress", "message": message, "percentage": percentage}))
    sys.stdout.flush()

def emit_log(message: str):
    print(json.dumps({"type": "log", "message": message}))
    sys.stdout.flush()

def extract_metadata_batch(directory: str, recurse: bool = False) -> dict:
    script_dir = Path(__file__).resolve().parent
    exiftool_exec_path = script_dir.parent / 'exiftool' / 'exiftool'
    
    exiftool_pull_data = [
        str(exiftool_exec_path), "-json", "-FilePath", "-FileName",
        "-BaseName", "-ContentIdentifier", "-CreateDate",
        "-LivePhotoVideoIndex", "-RuntimeScale"
    ]
    if recurse:
        exiftool_pull_data.append("-r")
    exiftool_pull_data.append(directory)
    
    result = subprocess.run(exiftool_pull_data, capture_output=True, text=True)
    if not result.stdout.strip():
        return {}
        
    exif_data = json.loads(result.stdout)
    return {item["FilePath"]: item for item in exif_data}

def get_date_part(create_date: str) -> str:
    if not create_date or not create_date.strip():
        return ""
    parts = create_date.strip().split()
    return parts[0] if parts else ""

def group_files_by_contentidentifier(files: list) -> dict:
    groups = defaultdict(list)
    photos = [f for f in files if f['type'] == 'photo']
    
    for file in files:
        content_identifier = file['metadata'].get('ContentIdentifier')
        
        if content_identifier:
            groups[content_identifier].append(file)
        elif file['type'] == 'video':
            video_filename = Path(file['path']).stem
            pattern = re.compile(rf'^{re.escape(video_filename)}(_\d+)?$')
            matching_photos = [
                p for p in photos 
                if pattern.match(Path(p['path']).stem)
            ]
            
            matched = False
            for photo in matching_photos:
                video_date = get_date_part(file['metadata'].get('CreateDate', ''))
                photo_date = get_date_part(photo['metadata'].get('CreateDate', ''))
                
                if video_date and photo_date and video_date == photo_date:
                    pid = photo['metadata'].get('ContentIdentifier')
                    if pid:
                        groups[pid].append(file)
                    else:
                        groups[(video_date, Path(photo['path']).stem)].append(file)
                    matched = True
                    break
            
            if not matched:
                groups['unmatched_videos'].append(file)
        else:
            date_part = get_date_part(file['metadata'].get('CreateDate', ''))
            if date_part:
                groups[(date_part, Path(file['path']).stem)].append(file)
            else:
                groups['no_identifier'].append(file)
                
    return groups

def add_xmp_metadata(photo_metadata: dict, motion_photo_path: str, video_offset: int):
    try:
        live_photo_video_index = int(photo_metadata.get("LivePhotoVideoIndex", 0))
        run_time_scale = int(photo_metadata.get("RunTimeScale", 1))
        if run_time_scale == 0:
            run_time_scale = 1
        micro_video_presentation_timestamp_us = int((live_photo_video_index / run_time_scale) * 1000000)
        
        script_dir = Path(__file__).resolve().parent
        config_file_path = script_dir.parent / 'exiftool' / 'google_camera.config'
        exiftool_exec_path = script_dir.parent / 'exiftool' / 'exiftool'
        
        exiftool_add_microvideo = [
            str(exiftool_exec_path), '-config', str(config_file_path),
            '-overwrite_original', '-m', '-q',
            '-XMP-GCamera:MicroVideo=1',
            '-XMP-GCamera:MicroVideoVersion=1',
            f'-XMP-GCamera:MicroVideoOffset={video_offset}',
            f'-XMP-GCamera:MicroVideoPresentationTimestampUs={micro_video_presentation_timestamp_us}',
            motion_photo_path
        ]
        subprocess.run(exiftool_add_microvideo, capture_output=True, text=True)
    except Exception:
        pass

def create_motion_photo(photo_path: str, video_path: str, metadata: dict, output_dir: str) -> bool:
    try:
        photo_p = Path(photo_path)
        base_name = photo_p.stem
        extension = photo_p.suffix
        
        if extension.lower() != ".heic":
            base_name += ".MP"
            
        motion_photo_path = Path(output_dir) / f"{base_name}{extension}"
        motion_photo_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(motion_photo_path, "wb") as outfile, \
             open(photo_path, "rb") as photo, \
             open(video_path, "rb") as video:
            outfile.write(photo.read())
            outfile.write(video.read())
            
        photo_filesize = os.path.getsize(photo_path)
        motion_photo_filesize = os.path.getsize(motion_photo_path)
        offset_in_bytes = motion_photo_filesize - photo_filesize
        
        add_xmp_metadata(metadata, str(motion_photo_path), offset_in_bytes)
        return True
    except Exception:
        return False

def process_directory(directory: str, recurse: bool, output_dir: str, heic_conversion: bool):
    emit_progress("Extracting metadata...", 10)
    metadata_by_path = extract_metadata_batch(directory, recurse)
    
    emit_progress("Processing files...", 20)
    files = []
    for file_path, metadata in metadata_by_path.items():
        ext = Path(file_path).suffix.lower()
        if ext in ['.jpg', '.jpeg', '.png', '.heic']:
            files.append({'path': file_path, 'metadata': metadata, 'type': 'photo'})
        elif ext in ['.mov', '.mp4']:
            files.append({'path': file_path, 'metadata': metadata, 'type': 'video'})
            
    emit_progress("Grouping files...", 40)
    groups = group_files_by_contentidentifier(files)
    
    total_groups = len([k for k in groups.keys() if k != 'unmatched_videos'])
    processed_groups = 0
    
    for group_key, group_files in groups.items():
        if group_key == 'unmatched_videos':
            continue
            
        processed_groups += 1
        progress = 40 + (processed_groups / max(total_groups, 1) * 50)
        emit_progress(f"Processing group {processed_groups} of {total_groups}...", progress)
        
        photos = [f for f in group_files if f['type'] == 'photo']
        videos = [f for f in group_files if f['type'] == 'video']
        
        if photos and videos:
            photo = photos[0]
            video = videos[0]
            if create_motion_photo(photo['path'], video['path'], photo['metadata'], output_dir):
                for f in group_files:
                    Path(f['path']).unlink(missing_ok=True)
        else:
            for f in group_files:
                dest_path = Path(output_dir) / Path(f['path']).name
                Path(f['path']).rename(dest_path)
                emit_log(f"Moved unmatched photo to: {dest_path}")
                
    emit_progress("Processing unmatched files...", 95)
    for video in groups.get('unmatched_videos', []):
        dest_path = Path(output_dir) / Path(video['path']).name
        Path(video['path']).rename(dest_path)
        emit_log(f"Moved unmatched video to: {dest_path}")
        
    emit_progress("Complete!", 100)

def process_individual_files(photo_path: str, video_path: str, output_dir: str):
    photo_metadata = extract_metadata_batch(photo_path)
    video_metadata = extract_metadata_batch(video_path)
    
    files = []
    for file_path, metadata in photo_metadata.items():
        files.append({'path': file_path, 'metadata': metadata, 'type': 'photo'})
    for file_path, metadata in video_metadata.items():
        files.append({'path': file_path, 'metadata': metadata, 'type': 'video'})
        
    groups = group_files_by_contentidentifier(files)
    
    for group_key, group_files in groups.items():
        photos = [f for f in group_files if f['type'] == 'photo']
        videos = [f for f in group_files if f['type'] == 'video']
        
        if photos and videos:
            photo = photos[0]
            video = videos[0]
            if create_motion_photo(photo['path'], video['path'], photo['metadata'], output_dir):
                for f in group_files:
                    Path(f['path']).unlink(missing_ok=True)
        else:
            for f in group_files:
                dest_path = Path(output_dir) / Path(f['path']).name
                Path(f['path']).rename(dest_path)

def main(args):
    out_dir = args.output
    if out_dir:
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        
    if args.dir:
        input_dir = Path(args.dir)
        if not input_dir.is_dir():
            sys.exit(1)
            
        has_files = any(input_dir.iterdir())
        if not has_files:
            sys.exit(1)
            
        if args.heic:
            macos_heic_to_jpg.check_directory_for_duplicates(args.dir, args.recurse)
            macos_heic_to_jpg.convert_directory(args.dir)
            
        process_directory(args.dir, args.recurse, out_dir or args.dir, args.heic)
        
    elif args.photo and args.video:
        if not Path(args.photo).is_file() or not Path(args.video).is_file():
            sys.exit(1)
            
        photo_path = args.photo
        if args.heic and photo_path.lower().endswith('.heic'):
            photo_path = macos_heic_to_jpg.convert_file(args.photo) or photo_path
            
        process_individual_files(photo_path, args.video, out_dir or str(Path(args.photo).parent))
    else:
        sys.exit(1)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--dir', type=str)
    parser.add_argument('--photo', type=str)
    parser.add_argument('--video', type=str)
    parser.add_argument('--output', type=str)
    parser.add_argument('--recurse', action='store_true')
    parser.add_argument('--heic', action='store_true')
    main(parser.parse_args())