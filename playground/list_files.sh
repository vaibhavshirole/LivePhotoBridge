# Set the target directory
TARGET_DIR="$1"

# Check if the directory is provided
if [ -z "$TARGET_DIR" ]; then
  echo "Usage: $0 <directory>"
  exit 1
fi

# Check if the directory exists
if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: Directory '$TARGET_DIR' does not exist."
  exit 1
fi

# List files that do not contain '.MP' in the filename
find "$TARGET_DIR" -type f ! -iname '*MP*' -print
