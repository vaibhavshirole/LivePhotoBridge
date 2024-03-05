import os
import subprocess

import getexif


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


def matching_video(photo_path, file_dir, recurse):
    # 1. call get_content_identifier on photo_path
    # 2. if recurse, go through all directories starting at file_dir using os.walk, and call get_content_identifier on every video
    #    else, go through current directory and call get_content_identifier on every video
    # 3. if the content identifier from photo_path matches the content identifier from video, then that's a matching video
   
    video_extensions = ['.mov', '.mp4', '.MOV', '.MP4']
    photo_content_identifier = get_content_identifier(photo_path)

    if photo_content_identifier:
        #logging.info("Looking for videos named: {}".format(photo_name))
        print("photo content id: " + photo_content_identifier)

        photo_name = os.path.splitext(os.path.basename(photo_path))[0]
        if recurse: 
            for root, dir, files in os.walk(file_dir):
                for file in files:
                    if os.path.splitext(file)[0] == photo_name:
                        for ext in video_extensions:
                            video_path = os.path.join(root, file.split('.')[0] + ext)
                            if os.path.exists(video_path):
                                return video_path
            return ""




            for root, dirs, files in os.walk(file_dir):
                for file in files:
                    if os.path.splitext(os.path.basename(photo_path))[0] == photo_name:
                        for ext in video_extensions:
                            video_path = os.path.join(root, file.split('.')[0] + ext)
                           
                            if os.path.exists(video_path):
                                #video_content_identifier = get_content_identifier(video_path)
                                #print("video content id: " + str(video_content_identifier))
                                return "hey"
        else:
            for file in os.listdir(file_dir):
                return
    else:
        return None


    
def process_directory(file_dir, recurse):
    """
    Loops through files in the specified directory and generates a list of (photo, video) path tuples that can
    be converted
    :param file_dir: directory to look for photos/videos to convert
    :param recurse: if true, subdirectories will recursively be processes
    :return: a list of tuples containing matched photo/video pairs.
    """
    #logging.info("Processing dir: {}".format(file_dir))
    file_pairs = []
    unmatched_images = []

    if recurse:
        print("recurse!")

        # 1. do an os.walk on file_dir
        # 2. call matching_video for every .jpg or .jpeg
        # 3. if matching_video returns a video_path, then add to file_pairs, else add to unmatched_images

        for root, dirs, files in os.walk(file_dir):
            for file in files:
                if file.lower().endswith(('.jpg', '.jpeg')):
                    photo_path = os.path.join(root, file)
                    video_path = matching_video(photo_path, file_dir, recurse)

                    if video_path:
                        file_pairs.append((os.path.join(root, file), video_path))
                    else:
                        unmatched_images.append(os.path.join(root, file))
    else:
        print("no recurse")

        for file in os.listdir(file_dir):
            if file.lower().endswith(('.jpg', '.jpeg')):
                photo_path = os.path.join(file_dir, file)
                video_path = matching_video(photo_path, file_dir, recurse)

    #logging.info("Found {} pairs.".format(len(file_pairs)))
    #logging.info("subset of found image/video pairs: {}".format(str(file_pairs[0:9])))

    if unmatched_images:
        print("Images without matching videos:")
        for image in unmatched_images:
            print(image)

    print(file_pairs)

    return file_pairs


file_dir = '/Users/vaibhav/Downloads/temp2'
process_directory(file_dir, 1)