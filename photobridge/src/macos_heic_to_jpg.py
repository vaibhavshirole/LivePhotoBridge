import os
import sys
import argparse
import subprocess

def convert_file(input_file):
    if not os.path.isfile(input_file):
        print("Error: Input is not a file.")
        return None
    
    if input_file.lower().endswith('.heic'):
        output_file = os.path.splitext(input_file)[0] + '.JPG'
        command = [
            'sips',
            '-s', 'format', 'jpeg',
            '-s', 'formatOptions', '100',
            input_file,
            '--out', output_file
        ]
        try:
            subprocess.run(command, check=True)
            os.remove(input_file)
            print("File converted: ", output_file)
            return output_file
        except subprocess.CalledProcessError as e:
            print(f"Error during conversion: {e}")
            return None
    else:
        print("Error: Input file is not in HEIC format:", input_file)
        return None


def convert_directory(input_directory):
    if not os.path.isdir(input_directory):
        print("Error: Input is not a directory.")
        return
    
    input_directory = '"'+input_directory+'"'

    command = [
        'find', input_directory, '-type', 'f', '-iname', '*.heic',
        '|', 'while', 'read', 'i;', 'do',
        'fileNoExt="${i%.*}";',
        'jpgFile="${fileNoExt}.JPG";',
        'sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '100', '"$i"', '--out', '"$jpgFile";',
        'touch', '-r', '"$i"', '"$jpgFile";',
        'rm', '"$i";',
        'done'
    ]
    with open(os.devnull, 'w') as devnull:
        subprocess.run(' '.join(command), shell=True, stdout=devnull)
    
    print("Files converted in: ", input_directory)


def check_directory_for_duplicates(input_directory, recurse=False):
    """
    Check the directory for duplicate .HEIC files with the same base filename.
    If multiple .HEIC files exist with the same base filename (and there is a corresponding .JPG),
    rename the .HEIC files by appending _1, _2, etc., while keeping the .JPG file unchanged.
    
    :param input_directory: The directory to check for duplicate files.
    :param recurse: Whether to recurse into subdirectories.
    """
    # Walk through the directory (and subdirectories if recurse is True)
    for root, dirs, files in os.walk(input_directory):
        print(f"Scanning directory: {root}")  # Print the current directory being scanned
        
        # Skip subdirectories if recurse is False
        if not recurse:
            dirs[:] = []  # Do not recurse into subdirectories
        
        # Create a dictionary to store files by base filename (without extension)
        file_groups = {}
        
        for file in files:
            base_filename, ext = os.path.splitext(file)
            if base_filename not in file_groups:
                file_groups[base_filename] = []
            file_groups[base_filename].append(file)

        # Process each group of files with the same base filename
        for base_filename, file_list in file_groups.items():
            
            heic_files = [file for file in file_list if file.lower().endswith('.heic')]
            jpg_files = [file for file in file_list if file.lower().endswith('.jpg')]

            if len(heic_files+jpg_files) > 1:
                # If there are multiple .HEIC files, rename them with counters
                print(f"Found {len(heic_files)} .HEIC files for base filename '{base_filename}'")
                
                # Keep the .JPG file unchanged, rename only the .HEIC files
                for idx, heic_file in enumerate(heic_files):
                    new_name = f"{base_filename}_{idx + 1}.HEIC"
                    old_path = os.path.join(root, heic_file)
                    new_path = os.path.join(root, new_name)

                    os.rename(old_path, new_path)


def create_arg_parser():
    # Creates and returns the ArgumentParser object
    parser = argparse.ArgumentParser(description='Convert HEIC to JPG in the most efficient possible way on macOS.')
    parser.add_argument('--dir', help='Path to the input directory.')
    parser.add_argument('--file', help='Path to the input file.')
    return parser


if __name__ == "__main__":
    arg_parser = create_arg_parser()
    parsed_args = arg_parser.parse_args(sys.argv[1:])
    
    if parsed_args.dir:
        if os.path.exists(parsed_args.dir):
            convert_directory(parsed_args.dir) # use sips on mac, faster, P3 color
        else:
            print("Directory does not exist:", parsed_args.dir)
    elif parsed_args.file:
        if os.path.exists(parsed_args.file):
            convert_file(parsed_args.file)
        else:
            print("File does not exist:", parsed_args.file)
    else:
        print("Please provide either --dir or --file option (-h for help)")