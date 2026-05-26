import os
import sys
import argparse
import subprocess
from pathlib import Path

def convert_file(input_file: str) -> str | None:
    input_path = Path(input_file)
    if not input_path.is_file() or input_path.suffix.lower() != '.heic':
        return None
    
    output_path = input_path.with_suffix('.JPG')
    command = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '100', str(input_path), '--out', str(output_path)]
    
    try:
        subprocess.run(command, check=True, capture_output=True)
        stat = input_path.stat()
        os.utime(output_path, (stat.st_atime, stat.st_mtime))
        input_path.unlink()
        return str(output_path)
    except subprocess.CalledProcessError:
        return None

def convert_directory(input_directory: str):
    dir_path = Path(input_directory)
    if not dir_path.is_dir():
        return
    
    for file_path in dir_path.rglob('*'):
        if file_path.is_file() and file_path.suffix.lower() == '.heic':
            convert_file(str(file_path))

def check_directory_for_duplicates(input_directory: str, recurse: bool = False):
    dir_path = Path(input_directory)
    if not dir_path.is_dir():
        return
    
    search_pattern = '**/*' if recurse else '*'
    file_groups = {}
    
    for file_path in dir_path.glob(search_pattern):
        if file_path.is_file():
            base_filename = file_path.stem
            file_groups.setdefault(base_filename, []).append(file_path)

    for base_filename, file_list in file_groups.items():
        heic_files = [f for f in file_list if f.suffix.lower() == '.heic']
        jpg_files = [f for f in file_list if f.suffix.lower() == '.jpg']
        
        if len(heic_files) + len(jpg_files) > 1 and heic_files:
            for idx, heic_file in enumerate(heic_files):
                new_name = f"{base_filename}_{idx + 1}{heic_file.suffix}"
                new_path = heic_file.with_name(new_name)
                heic_file.rename(new_path)

def create_arg_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dir')
    parser.add_argument('--file')
    return parser

if __name__ == "__main__":
    arg_parser = create_arg_parser()
    parsed_args = arg_parser.parse_args(sys.argv[1:])
    
    if parsed_args.dir and Path(parsed_args.dir).exists():
        convert_directory(parsed_args.dir)
    elif parsed_args.file and Path(parsed_args.file).exists():
        convert_file(parsed_args.file)