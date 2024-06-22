import subprocess

"/Users/vaibhav/Desktop/PXL_20240228_214454169.MP.jpg"

"/Users/vaibhav/Desktop/IMG_3693.HEIC"
"/Users/vaibhav/Desktop/IMG_3693.JPG"

"/Users/vaibhav/Desktop/IMG_3693_MP.HEIC"
"/Users/vaibhav/Desktop/IMG_3693_MP.JPG"

# Construct the ExifTool command
command = ['exiftool', '-xmp', '-b', "/Users/vaibhav/Downloads/IMG_3693_MP.JPG"]

try:
    # Run the command and capture the output
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    
    # Output the XMP metadata
    print(result.stdout)

except subprocess.CalledProcessError as e:
    # Handle any errors
    print("Error:", e)


# f = open("/Users/vaibhav/Desktop/IMG_3693_MP.HEIC", 'rb')
# d = f.read()
# xmp_start = d.find(b'<x:xmpmeta')
# xmp_end = d.find(b'</x:xmpmeta')
# xmp_str = d[xmp_start:xmp_end+12]

# # Convert xmp_str to a string
# xmp_str = xmp_str.decode()

# # Replace '>' with '>\n' to insert newlines after each XMP item
# xmp_str = xmp_str.replace('>', '>\n')

# print(xmp_str)