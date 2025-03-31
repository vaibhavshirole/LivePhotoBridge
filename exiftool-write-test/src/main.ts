import {
  writeMetadata,
  ExifToolWriteOptions,
  parseMetadata, // <-- Import parseMetadata
  ExifToolOptions // <-- Import ExifToolOptions type
} from '@uswriting/exiftool';

document.addEventListener('DOMContentLoaded', () => {
  // --- Element References ---
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  const fileStatusDiv = document.getElementById('fileStatus') as HTMLDivElement;
  // Write elements
  const writeButton = document.getElementById('writeButton') as HTMLButtonElement;
  const writeStatusDiv = document.getElementById('status') as HTMLDivElement; // Renamed from 'status'
  const downloadLink = document.getElementById('downloadLink') as HTMLAnchorElement;
  // Read elements
  const readButton = document.getElementById('readButton') as HTMLButtonElement;
  const readStatusDiv = document.getElementById('readStatus') as HTMLDivElement;
  const readResultPre = document.getElementById('readResult') as HTMLPreElement;

  // --- Check if all elements were found ---
  if (!fileInput || !fileStatusDiv || !writeButton || !writeStatusDiv || !downloadLink || !readButton || !readStatusDiv || !readResultPre) {
      console.error("Failed to find one or more required HTML elements!");
      alert("Error initializing page: Could not find all required elements. Check console.");
      return;
  }

  // --- State ---
  let selectedFile: File | null = null;

  // --- Event Listener for File Input ---
  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files ? fileInput.files[0] : null;
    if (selectedFile) {
        fileStatusDiv.textContent = `Selected: ${selectedFile.name} (${selectedFile.type})`;
        writeButton.disabled = false;
        readButton.disabled = false;
        // Clear previous results on new file selection
        writeStatusDiv.textContent = '';
        downloadLink.style.display = 'none';
        downloadLink.href = '#';
        readStatusDiv.textContent = '';
        readResultPre.textContent = '';
    } else {
        fileStatusDiv.textContent = 'No file selected';
        writeButton.disabled = true;
        readButton.disabled = true;
    }
  });

  // --- Event Listener for Write Button ---
  writeButton.addEventListener('click', async () => {
    if (!selectedFile) {
      writeStatusDiv.textContent = 'Error: Please select a file first.';
      return;
    }

    writeStatusDiv.textContent = 'Loading config file...';
    downloadLink.style.display = 'none';
    readButton.disabled = true; // Disable read while writing

    const configFileContent = await loadConfigFile('/google.config');

    if (!configFileContent) {
        writeStatusDiv.textContent = 'Error: Could not load ExifTool config file. Cannot write custom tags.';
        readButton.disabled = false; // Re-enable read button
        return;
    }
    writeStatusDiv.textContent = 'Config loaded. Writing metadata...';

    const dummyOffset = 123456;
    const dummyTimestamp = 98765;
    const tagsToWrite = [
      "-XMP-GCamera:MicroVideo=1", "-XMP-GCamera:MicroVideoVersion=1",
      `-XMP-GCamera:MicroVideoOffset=${dummyOffset}`, `-XMP-GCamera:MicroVideoPresentationTimestampUs=${dummyTimestamp}`,
    ];
    const extraArgs = ["-m", "-q"];
    const options: ExifToolWriteOptions = { tags: tagsToWrite, extraArgs: extraArgs, configFile: configFileContent };

    try {
      console.log("Calling writeMetadata with GCamera options:", options);
      const result = await writeMetadata(selectedFile, options);

      if (result.success) {
        writeStatusDiv.textContent = `Success! Metadata written. Warnings: ${result.warnings || 'None'}`;
        const blob = new Blob([result.data], { type: selectedFile.type });
        const url = URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = `gcam_${selectedFile.name}`;
        downloadLink.style.display = 'block';
        downloadLink.textContent = `Download Modified ${selectedFile.name}`;
      } else {
        writeStatusDiv.textContent = `Error writing metadata: ${result.error} (Code: ${result.exitCode})`;
        console.error("Write failed:", result);
      }
    } catch (error) {
        const message = (error instanceof Error) ? error.message : String(error);
        writeStatusDiv.textContent = `JavaScript Error during write: ${message}`;
        console.error("Error calling writeMetadata:", error);
    } finally {
        readButton.disabled = false; // Re-enable read button
    }
  }); // End Write Button Listener

  // --- Event Listener for Read Button ---
  readButton.addEventListener('click', async () => {
    if (!selectedFile) {
      readStatusDiv.textContent = 'Error: Please select a file first.';
      return;
    }

    readStatusDiv.textContent = 'Reading metadata...';
    readResultPre.textContent = ''; // Clear previous results
    writeButton.disabled = true; // Disable write while reading

    // Define the arguments for ExifTool based on the Python list
    const argsToParse = [
        "-json", // Output as JSON
        // Specific tags to extract:
        "-FilePath",
        "-FileName",
        "-BaseName", // Note: BaseName might not be a standard ExifTool tag, consider -FileName without extension
        "-ContentIdentifier", // Often used in QuickTime/MP4
        "-CreateDate",
        "-LivePhotoVideoIndex", // Specific Apple tag
        "-RuntimeScale", // Check tag name, might be QuickTime:MediaHeader:TimeScale or similar
        // NOTE: -r (recurse) and directory path are not applicable for single file processing in browser
    ];

    // Define options for parseMetadata
    // CRUCIAL: Use transform to parse the JSON string output from ExifTool
    const options: ExifToolOptions<any> = { // Use 'any' or a specific interface for the expected JSON structure
        args: argsToParse,
        transform: (data: string) => JSON.parse(data) // Parse the JSON string result
    };

    try {
        console.log("Calling parseMetadata with options:", options);
        // parseMetadata returns the raw string by default, but our transform converts it
        const result = await parseMetadata(selectedFile, options);

        if (result.success) {
            // result.data is now a JavaScript object (or array, as -json returns an array for single file)
            readStatusDiv.textContent = `Metadata read successfully. Warnings: ${result.error || 'None'}`; // Use result.error for warnings here

            // Pretty-print the JSON object into the <pre> tag
            // ExifTool -json outputs an array even for one file, so access the first element
            const jsonData = Array.isArray(result.data) && result.data.length > 0 ? result.data[0] : result.data;
            readResultPre.textContent = JSON.stringify(jsonData, null, 2); // null, 2 for indentation

        } else {
            readStatusDiv.textContent = `Error reading metadata: ${result.error} (Code: ${result.exitCode})`;
            readResultPre.textContent = `Error:\n${result.error}`; // Display error in the result area too
            console.error("Read failed:", result);
        }

    } catch (error) {
        // Catch errors from parseMetadata call itself or JSON.parse
        const message = (error instanceof Error) ? error.message : String(error);
        readStatusDiv.textContent = `JavaScript Error during read: ${message}`;
        readResultPre.textContent = `JavaScript Error:\n${message}`;
        console.error("Error calling parseMetadata:", error);
    } finally {
        writeButton.disabled = false; // Re-enable write button
    }
  }); // End Read Button Listener


  // --- Helper function to load config file (keep as is) ---
  async function loadConfigFile(url: string): Promise<{ name: string; data: Uint8Array } | undefined> {
    try {
        console.log(`Attempting to load config file from: ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        const fileName = url.substring(url.lastIndexOf('/') + 1);
        console.log(`Successfully loaded config file: ${fileName}`);
        return { name: fileName, data: new Uint8Array(arrayBuffer) };
    } catch (e) {
        const message = (e instanceof Error) ? e.message : String(e);
        console.error(`Failed to load config file from ${url}:`, message);
        // Update status only if it exists and is relevant (e.g., write status)
        if(writeStatusDiv) writeStatusDiv.textContent = `Error: Failed to load config file ${url}. Cannot write custom tags. Check console.`;
        return undefined;
    }
  }

}); // End of DOMContentLoaded listener