import subprocess
import sys

offset = 4254557
MicroVideoPresentationTimestampUs = 575676

merged_file = sys.argv[1]
print(merged_file)

exiftool_cmd = [
    'exiftool', 
    '-config', '/Users/vaibhav/Developer/projects/PhotoMuxer/exiftool/google_camera.config', 
    '-overwrite_original', 
    '-m',
    '-q',
    '-XMP-GCamera:MicroVideo=1', 
    '-XMP-GCamera:MicroVideoVersion=1', 
    '-XMP-GCamera:MicroVideoOffset=' + str(offset) + '', 
    '-XMP-GCamera:MicroVideoPresentationTimestampUs=' + str(MicroVideoPresentationTimestampUs) + '', 
    '-XMP-Item:Mime=image/jpeg', 
    '-XMP-Item:Semantic=Primary', 
    '-XMP-Item:Length=0', 
    '-XMP-Item:Padding=0', 
    merged_file
]
try:
    subprocess.run(exiftool_cmd)
except subprocess.CalledProcessError as e:
    print("Error, adding_xmp_metadata:", e)