import subprocess

"/Users/vaibhav/Desktop/PXL_20240228_214454169.MP.jpg"
"/Users/vaibhav/Downloads/out/IMG_3693.jpeg"
"/Users/vaibhav/Desktop/IMG_3693.MP.JPG"

# Construct the ExifTool command
command = ['exiftool', '-xmp', '-b', "/Users/vaibhav/Downloads/out/IMG_3693.heic"]

try:
    # Run the command and capture the output
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    
    # Output the XMP metadata
    print(result.stdout)

except subprocess.CalledProcessError as e:
    # Handle any errors
    print("Error:", e)