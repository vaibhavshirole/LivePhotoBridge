import os

'''
file_dir = '/Users/vaibhav/Downloads/temp2'
file_pairs = []

""" for root, dirs, files in os.walk(file_dir):
    print("Current directory:", root)
    print("Subdirectories:", dirs)
    print("Files:", files) """

def matching_video(photo_name, file_dir):
    #logging.info("Looking for videos named: {}".format(photo_name))
    video_extensions = ['.mov', '.mp4', '.MOV', '.MP4']
    for root, _, files in os.walk(file_dir):
        for file in files:
            if os.path.splitext(file)[0] == photo_name:
                for ext in video_extensions:
                    video_path = os.path.join(root, file.split('.')[0] + ext)
                    if os.path.exists(video_path):
                        return video_path
    return ""

for root, _, files in os.walk(file_dir):
    for file in files:
        if file.lower().endswith(('.jpg', '.jpeg')):
            photo_name = os.path.splitext(file)[0]
            video_path = matching_video(photo_name, file_dir)
            if video_path:
                file_pairs.append((os.path.join(root, file), video_path))

print(file_pairs)
'''

inputFile = "/Users/vaibhav/Downloads/temp/IMG_5099.MP.HEIC"
print(os.path.splitext(inputFile)[0])