f = open('/Users/vaibhav/Downloads/IMG_4965.JPG', 'rb')
d = f.read()
xmp_start = d.find(b'<x:xmpmeta')
xmp_end = d.find(b'</x:xmpmeta')
xmp_str = d[xmp_start:xmp_end+12]

# Convert xmp_str to a string
xmp_str = xmp_str.decode()

# Replace '>' with '>\n' to insert newlines after each XMP item
xmp_str = xmp_str.replace('>', '>\n')

print(xmp_str)