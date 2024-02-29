from PIL import Image
import piexif
import pillow_heif
import os
from pathlib import Path

def convert_heic_to_jpg(input_file):
    # Open the HEIC file and reset the pointer
    heif_file = pillow_heif.read_heif(input_file)

    # Extract EXIF data if available
    exif_dict = {}
    if 'exif' in heif_file.info:
        exif_dict = heif_file.info['exif']

    # Create the new image
    image = Image.frombytes(
        heif_file.mode,
        heif_file.size,
        heif_file.data,
        "raw",
        heif_file.mode,
        heif_file.stride,
    )

    # Save the image as JPG with EXIF data if available
    output_file = os.path.splitext(input_file)[0] + ".JPG"
    image.save(output_file, "JPEG", exif=exif_dict)

    # Deal with orientation
    img = Image.open(output_file)
    if "exif" in img.info:
        exif_dict = piexif.load(img.info['exif'])

    if piexif.ImageIFD.Orientation in exif_dict['0th']:
        exif_dict['0th'][piexif.ImageIFD.Orientation] = 1
        exif_dict['Exif'][41729] = b'1'
        exif_bytes = piexif.dump(exif_dict)

    img.save(output_file, exif=exif_bytes)

    # Delete the HEIC file
    os.remove(input_file)
    img.seek(0)
    image.seek(0)

def convert_directory(input_directory):
    for filename in os.listdir(input_directory):
        if filename.endswith(".HEIC"):
            filepath = os.path.join(input_directory, filename)
            convert_heic_to_jpg(filepath)

if __name__ == "__main__":
    input_directory = "src"  # Specify the input directory containing HEIC files
    convert_directory(input_directory)