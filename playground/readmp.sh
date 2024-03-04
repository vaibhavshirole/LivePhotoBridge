#!/bin/bash
#
# Extracts the motion part of a MotionPhoto file PXL_*.MP.mp4

set -e

# Get metadata
offset=$(exiv2 -p x "$1" | grep Length | tail -n 1 |  rev | cut -d ' ' -f 1 | rev)
echo offset: ${offset}

# Check if offset is a valid number with regex
if ! [[ "$offset" =~ ^[0-9]+$ ]] ; then
   echo "offset not found or invalid"
   exit 1
fi

# Calculate file size using wc program
filesize=$(wc -c < "$1")
echo filesize: $filesize

# Calculate extract position given by Timo Jyrinki
extractposition=$((filesize - offset))
echo extractposition=$extractposition

# Extract motion part using dd
dd if="$1" skip=1 bs=$extractposition of="$(basename -s .jpg "$1").mp4"
