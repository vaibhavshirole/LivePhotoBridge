import pyexiv2

def print_metadata(image_path):
    try:
        # Open the image file
        metadata = pyexiv2.ImageMetadata(image_path)
        metadata.read()

        # Print all metadata tags and values
        print("Metadata:")
        print("------------------")
        for key in metadata.exif_keys:
            print(f"{key}: {metadata[key].raw_value}")
    except Exception as e:
        print(f"Error: {e}")

# Example usage
if __name__ == "__main__":
    image_path = "/Users/vaibhav/Downloads/IMG_5002.JPG"  # Replace with the path to your image file
    print_metadata(image_path)