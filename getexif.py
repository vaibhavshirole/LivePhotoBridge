# below is a working script to get a text file of all exif
# exiftool -a -u -g1 -ee3 -api RequestAll=3 IMG_5002.JPG >IMG_5002.JPG_exif.txt

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

def extract_exif_data(input_file, output_file):
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

if __name__ == '__main__':
    filename = "/Users/vaibhav/Documents/Media/Syncbox/IMG_5002.JPG"
    output_file =  "/Users/vaibhav/Downloads/JPG_exif.txt"
    extract_exif_data(filename, output_file) # uncomment if you want to save the data into a file

    content_identifier = get_content_identifier(filename)
    if content_identifier:
        print("Content Identifier:", content_identifier)

        live_photo_video_index = get_live_photo_video_index(filename)
        if live_photo_video_index:
            print("Live Photo Video Index:", live_photo_video_index)
        else:
            print("Live Photo Video Index does not exist in the metadata.")

        run_time_scale = get_run_time_scale(filename)
        if run_time_scale:
            print("Run Time Scale:", run_time_scale)
        else:
            print("Run Time Scale does not exist in the metadata.")
    else:
        print("Content Identifier does not exist in the metadata.")