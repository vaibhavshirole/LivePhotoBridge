import subprocess
import json

# exiftool -T -json -filepath -contentidentifier -livephotovideoindex -runtimescale -r me/ > out.txt
exiftool_pull_data = [
    "exiftool",
    "-json",
    "-filepath",
    "-FileName",
    "-BaseName",
    "-contentidentifier",
    "-createdate",
    "-livephotovideoindex",
    "-runtimescale",
    "-r",
    "/Users/vaibhav/Desktop/me/live"
]

result = subprocess.run(exiftool_pull_data, capture_output=True, text=True)

if result.returncode == 0:
    # Load the JSON data
    exif_data = json.loads(result.stdout)
    # print(json.dumps(exif_data, indent=4)) # Print whole json

    print('ContentIdentifier:')
    for item in exif_data:
        if 'ContentIdentifier' in item:
            print(f"{item['FileName']}: {item['ContentIdentifier']}")
        else:
            print("Not found in this item.")
    
    print('\nCreateDate:')
    for item in exif_data:
        if 'CreateDate' in item:
            print(f"{item['FileName']}: {item['CreateDate']}")
        else:
            print("Not found in this item.")

else:
    print(f"ERROR: {result.stderr}")