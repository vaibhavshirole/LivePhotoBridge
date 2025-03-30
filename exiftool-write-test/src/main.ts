import { writeMetadata, ExifToolWriteOptions } from '@uswriting/exiftool'; // Import from your linked library

// Assume TextEncoder/Decoder are globally available

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  const writeButton = document.getElementById('writeButton') as HTMLButtonElement;
  const statusDiv = document.getElementById('status') as HTMLDivElement;
  const downloadLink = document.getElementById('downloadLink') as HTMLAnchorElement;

  if (!fileInput || !writeButton || !statusDiv || !downloadLink) {
      console.error("Failed to find one or more required HTML elements!");
      return;
  }

  let selectedFile: File | null = null;

  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files ? fileInput.files[0] : null;
    statusDiv.textContent = selectedFile ? `Selected: ${selectedFile.name}` : 'No file selected';
    downloadLink.style.display = 'none';
    downloadLink.href = '#';
  });

  writeButton.addEventListener('click', async () => { // Ensure this is async
    if (!selectedFile) {
      statusDiv.textContent = 'Error: Please select a file first.';
      return;
    }

    statusDiv.textContent = 'Loading config file...';
    downloadLink.style.display = 'none';

    // --- Load the Google Camera Config File ---
    const configFileContent = await loadConfigFile('/google.config'); // Path relative to public dir

    if (!configFileContent) {
        // Error message already shown by loadConfigFile
        statusDiv.textContent = 'Error: Could not load ExifTool config file. Cannot write custom tags.';
        return;
    }
    statusDiv.textContent = 'Config loaded. Processing metadata... (This might take a moment)';


    // --- Define GCamera Tags with Dummy Data ---
    const dummyOffset = 123456; // Example offset value
    const dummyTimestamp = 98765; // Example timestamp value

    const tagsToWrite = [
      "-XMP-GCamera:MicroVideo=1",
      "-XMP-GCamera:MicroVideoVersion=1",
      `-XMP-GCamera:MicroVideoOffset=${dummyOffset}`,
      `-XMP-GCamera:MicroVideoPresentationTimestampUs=${dummyTimestamp}`,
      // You could add standard tags too if desired:
      // "-Comment=Added GCamera XMP tags",
    ];

    // --- Define Extra ExifTool Arguments ---
    const extraArgs = [
        "-m", // Ignore minor errors
        "-q"  // Quiet mode (less console output from exiftool itself)
    ];


    // --- Prepare Options for writeMetadata ---
    const options: ExifToolWriteOptions = {
        tags: tagsToWrite,
        extraArgs: extraArgs,
        configFile: configFileContent, // Pass the loaded config file data
    };

    // --- Call writeMetadata and handle result ---
    try {
      console.log("Calling writeMetadata with GCamera options:", options);
      const result = await writeMetadata(selectedFile, options);

      if (result.success) {
        statusDiv.textContent = `Success! GCamera metadata written. Warnings: ${result.warnings || 'None'}`;
        console.log("Write successful. Warnings:", result.warnings);
        console.log("Received modified data size:", result.data.byteLength);

        const blob = new Blob([result.data], { type: selectedFile.type });
        const url = URL.createObjectURL(blob);

        downloadLink.href = url;
        downloadLink.download = `gcam_${selectedFile.name}`; // Suggest different name
        downloadLink.style.display = 'block';
        downloadLink.textContent = `Download Modified ${selectedFile.name}`;

      } else {
        statusDiv.textContent = `Error writing GCamera metadata: ${result.error} (Exit code: ${result.exitCode})`;
        console.error("Write failed:", result);
      }
    } catch (error) {
        const message = (error instanceof Error) ? error.message : String(error);
        statusDiv.textContent = `JavaScript Error: ${message}`;
        console.error("Error during writeMetadata call:", error);
    }
  }); // End of writeButton click listener


  // --- Helper function to load config file (keep as is) ---
  async function loadConfigFile(url: string): Promise<{ name: string; data: Uint8Array } | undefined> {
      try {
          console.log(`Attempting to load config file from: ${url}`);
          const response = await fetch(url);
          if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status} for ${url}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const fileName = url.substring(url.lastIndexOf('/') + 1);
          console.log(`Successfully loaded config file: ${fileName}`);
          return { name: fileName, data: new Uint8Array(arrayBuffer) };
      } catch (e) {
          const message = (e instanceof Error) ? e.message : String(e);
          console.error(`Failed to load config file from ${url}:`, message);
          // Update status only if it exists
          if(statusDiv) statusDiv.textContent = `Error: Failed to load config file ${url}. Cannot write custom tags. Check console.`;
          return undefined; // Indicate failure
      }
  }

}); // End of DOMContentLoaded listener