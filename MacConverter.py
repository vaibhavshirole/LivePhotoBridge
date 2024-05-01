import os
import sys
import argparse
import subprocess

def convert_heic_to_jpg(input_file, output_file):
    command = [
        'sips',
        '-s', 'format', 'jpeg',
        '-s', 'formatOptions', '100',
        input_file,
        '--out', output_file
    ]
    subprocess.run(command)

def convert_directory(input_directory):
    if not os.path.isdir(input_directory):
        print("Error: Input is not a directory.")
        return

    for file_name in os.listdir(input_directory):
        if file_name.lower().endswith('.heic'):
            input_file = os.path.join(input_directory, file_name)
            output_file = os.path.splitext(input_file)[0] + '.JPG'
            convert_heic_to_jpg(input_file, output_file)
    return 

def convert_file(input_file):
    if not os.path.isfile(input_file):
        print("Error: Input is not a file.")
        return
    
    if input_file.lower().endswith('.heic'):
        output_file = os.path.splitext(input_file)[0] + '.JPG'
        convert_heic_to_jpg(input_file, output_file)
        print("File converted:", output_file)
    else:
        print("Error: Input file is not in HEIC format:", input_file)
    return 

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