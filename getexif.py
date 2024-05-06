import os
import sys
import argparse
import subprocess

def get_metadata_fields(filename):
    command = [
        "exiftool",
        "-a",
        "-u",
        "-g1",
        "-ee3",
        "-api", "RequestAll=3",
        filename
    ]

    output = subprocess.run(command, capture_output=True, text=True, encoding="ISO-8859-1") # not utf-8

    metadata = {}
    if output.returncode == 0:
        lines = output.stdout.split('\n')
        for line in lines:
            if ":" in line:
                key, value = line.split(':', 1)
                metadata[key.strip()] = value.strip()
    return metadata

def get_content_identifier(filename):
    metadata = get_metadata_fields(filename)
    return metadata.get('Content Identifier')

def get_live_photo_video_index(filename):
    metadata = get_metadata_fields(filename)
    return metadata.get('Live Photo Video Index')

def get_run_time_scale(filename):
    metadata = get_metadata_fields(filename)
    return metadata.get('Run Time Scale')

def save_metadata(input_file, output_file):
    command = [
        "exiftool",
        "-a",
        "-u",
        "-g1",
        "-ee3",
        "-api", "RequestAll=3",
        input_file
    ]
    with open(output_file, "w") as f:
        subprocess.run(command, stdout=f)

def create_arg_parser():
    # Creates and returns the ArgumentParser object
    parser = argparse.ArgumentParser(description='Get all EXIF of a given image into a .txt, or just in your console.')
    parser.add_argument('--file', help='Path to the input file.')
    parser.add_argument('--outfile', help='Provide a .txt of all EXIF.', action='store_true')
    return parser

if __name__ == '__main__':
    arg_parser = create_arg_parser()
    parsed_args = arg_parser.parse_args(sys.argv[1:])

    if parsed_args.file:
        if os.path.exists(parsed_args.file):

            output_directory = os.path.dirname(parsed_args.file)
            output_file = os.path.join(output_directory, os.path.splitext(os.path.basename(parsed_args.file))[0] + '_exif.txt')

            print(get_metadata_fields(parsed_args.file))
            print("")
            print("")

            content_identifier = get_content_identifier(parsed_args.file)
            if content_identifier:
                print("Content Identifier:", content_identifier)

                live_photo_video_index = get_live_photo_video_index(parsed_args.file)
                if live_photo_video_index:
                    print("Live Photo Video Index:", live_photo_video_index)
                else:
                    print("Live Photo Video Index does not exist in the metadata.")

                run_time_scale = get_run_time_scale(parsed_args.file)
                if run_time_scale:
                    print("Run Time Scale:", run_time_scale)
                else:
                    print("Run Time Scale does not exist in the metadata.")
            else:
                print("Content Identifier does not exist in the metadata.")

            if parsed_args.outfile:
                save_metadata(parsed_args.file, output_file)
            
        else:
            print("File does not exist:", parsed_args.file)