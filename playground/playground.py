import subprocess

#exiftool -T -createdate -aperture -shutterspeed -iso DIR > out.txt

dir = "/Users/vaibhav/Desktop/me"

command = [
    "exiftool",
    "-ext",
    "-T",
    "-createdate",
    "-aperture",
    "-shutterspeed",
    "-iso",
    dir
]

output = subprocess.run(command, capture_output=True, text=True, encoding="ISO-8859-1") # not utf-8

metadata = {}
if output.returncode == 0:
    lines = output.stdout.split('\n')
    for line in lines:
        if ":" in line:
            key, value = line.split(':', 1)
            metadata[key.strip()] = value.strip()

print(metadata)