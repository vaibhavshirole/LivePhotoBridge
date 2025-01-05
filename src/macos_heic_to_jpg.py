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


def check_directory_for_duplicates(input_directory, recurse):
    pass

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