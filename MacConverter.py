import os
import sys
import argparse

def convert_directory(inputDirectory):
    bash_command = '''
    cd {}
    for file in *.HEIC; 
    do 
        sips -s format jpeg "$file" --out "${{file%.HEIC}}.JPG"
        
        # Remove the HEIC file after conversion
        rm "$file"
    done
    '''.format(inputDirectory)

    os.system(bash_command)


# to-do: add support to convert just a single file if needed

def create_arg_parser():
    # Creates and returns the ArgumentParser object

    parser = argparse.ArgumentParser(description='Quickly convert HEIC to JPG.')
    parser.add_argument('--inputDirectory',
                    help='Path to the input directory.')
    return parser


if __name__ == "__main__":
    arg_parser = create_arg_parser()
    parsed_args = arg_parser.parse_args(sys.argv[1:])
    if os.path.exists(parsed_args.inputDirectory):
        print("Dir exists")

        convert_directory(parsed_args.inputDirectory) # use sips, faster, P3 color