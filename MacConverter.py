import os
import sys
import argparse

def convert_directory(inputDirectory):
    if not os.path.isdir(inputDirectory):
        print("Error: Input is not a directory.")
        return
    
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

def convert_file(inputFile):
    if not os.path.isfile(inputFile):
        print("Error: Input is not a file.")
        return
    
    if inputFile.lower().endswith('.heic'):
        output_file = os.path.splitext(inputFile)[0] + '.JPG'
        os.system('sips -s format jpeg "{}" --out "{}"'.format(inputFile, output_file))
        print("File converted:", output_file)
    else:
        print("Error: Input file is not in HEIC format:", inputFile)
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