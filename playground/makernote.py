import pyexiv2
import exiftool

def print_metadata(image_path):
    try:
        # Open the image file
        metadata = pyexiv2.ImageMetadata(image_path)
        metadata.read()

        # Check if Exif.Photo.MakerNote exists
        if 'Exif.Photo.MakerNote' in metadata.exif_keys:
            # Get the value of Exif.Photo.Orientation tag
            orientation = metadata['Exif.Photo.MakerNote'].raw_value
            print(f"Exif.Photo.MakerNote: {orientation}")
        else:
            print("Exif.Photo.MakerNote tag not found in metadata.")
    except Exception as e:
        print(f"Error: {e}")

# Example usage
if __name__ == "__main__":
    image_path = "/Users/vaibhav/Downloads/IMG_5002.JPG"  # Replace with the path to your image file
    print_metadata(image_path)
