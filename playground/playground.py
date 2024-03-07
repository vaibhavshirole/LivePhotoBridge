import os

def write_files_to_text(directory_path, output_file):
    with open(output_file, 'w') as file:
        for filename in os.listdir(directory_path):
            file.write(filename + '\n')

# Example usage:
directory_path = '/Users/vaibhav/Downloads/2021/oct-dec'
output_file = 'file_list.txt'
write_files_to_text(directory_path, output_file)