// renderer.js
const { ipcRenderer } = require('electron');

// State management
let state = {
    dirPath: null,
    photoPath: null,
    videoPath: null,
    outputPath: null,
    recurse: false,
    heic: false,
    isProcessing: false
};

// Logging function
function log(message) {
    const logElement = document.getElementById('log');
    logElement.textContent += `${message}\n`;
    logElement.scrollTop = logElement.scrollHeight;
}

// Clear text in log
function clearLog() {
    const logElement = document.getElementById('log');
    logElement.textContent = '';
}

// Progress bar management
function showProgress(show = true) {
    document.querySelector('.progress-container').style.display = show ? 'block' : 'none';
}

function updateProgress(percentage) {
    document.querySelector('.progress-fill').style.width = `${percentage}%`;
}

function resetProgress() {
    updateProgress(0);
    showProgress(false);
}

// Update UI based on state
function updateUI() {
    document.getElementById('dir-path').textContent = state.dirPath || '';
    document.getElementById('photo-path').textContent = state.photoPath || '';
    document.getElementById('video-path').textContent = state.videoPath || '';
    document.getElementById('output-path').textContent = state.outputPath || '';
    
    // Enable/disable start button based on valid input combinations
    const startButton = document.getElementById('start');
    const hasValidInputs = state.dirPath || (state.photoPath && state.videoPath);
    startButton.disabled = !hasValidInputs || state.isProcessing;
}

// File selection handlers
async function selectDirectory(buttonId, logMessage) {
    try {
        const result = await ipcRenderer.invoke('select-directory');
        if (!result.canceled) {
            const path = result.filePaths[0];
            switch(buttonId) {
                case 'select-dir':
                    state.dirPath = path;
                    // Clear photo/video paths if directory is selected
                    state.photoPath = null;
                    state.videoPath = null;
                    break;
                case 'select-output':
                    state.outputPath = path;
                    break;
            }
            log(`${logMessage}: ${path}`);
            updateUI();
        }
    } catch (error) {
        log(`Error selecting directory: ${error}`);
    }
}

async function selectFile(type) {
    try {
        const filters = type === 'photo' 
            ? [{ name: 'Images', extensions: ['jpg', 'jpeg', 'heic'] }]
            : [{ name: 'Videos', extensions: ['mov', 'mp4'], }];
        
        const result = await ipcRenderer.invoke('select-file', filters);
        if (!result.canceled) {
            const path = result.filePaths[0];
            if (type === 'photo') {
                state.photoPath = path;
                // Clear directory path if photo is selected
                state.dirPath = null;
            } else {
                state.videoPath = path;
                state.dirPath = null;
            }
            log(`Selected ${type}: ${path}`);
            updateUI();
        }
    } catch (error) {
        log(`Error selecting ${type}: ${error}`);
    }
}

// Button event listeners
document.getElementById('select-dir').addEventListener('click', () => 
    selectDirectory('select-dir', 'Selected directory'));

document.getElementById('select-output').addEventListener('click', () => 
    selectDirectory('select-output', 'Selected output directory'));

document.getElementById('clear-output').addEventListener('click', () => {
    state.outputPath = null;
    log('Cleared output directory');
    updateUI();
});

document.getElementById('select-photo').addEventListener('click', () => 
    selectFile('photo'));

document.getElementById('select-video').addEventListener('click', () => 
    selectFile('video'));

// Checkbox event listeners
document.getElementById('recurse').addEventListener('change', (e) => {
    state.recurse = e.target.checked;
    log(`Recurse option ${e.target.checked ? 'enabled' : 'disabled'}`);
});

document.getElementById('heic').addEventListener('change', (e) => {
    state.heic = e.target.checked;
    log(`HEIC conversion ${e.target.checked ? 'enabled' : 'disabled'}`);
});

// Log clearing event listeners
document.getElementById('clear-log').addEventListener('click', clearLog);

// Start button handler
document.getElementById('start').addEventListener('click', async () => {
    try {
        state.isProcessing = true;
        updateUI();
        log('Starting PhotoBridge processing...');
        
        // Reset and show progress bar
        resetProgress();
        showProgress();
        updateProgress(10); // Show initial progress

        const options = {
            dir: state.dirPath,
            photo: state.photoPath,
            video: state.videoPath,
            output: state.outputPath,
            recurse: state.recurse,
            heic: state.heic
        };

        // Subscribe to Python script output
        ipcRenderer.on('python-output', (event, data) => {
            try {
                const parsedData = JSON.parse(data);
                
                if (parsedData.type === 'progress') {
                    updateProgress(parsedData.percentage);
                    log(parsedData.message);
                } else if (parsedData.type === 'log') {
                    log(parsedData.message);
                }
            } catch (e) {
                // If the message isn't JSON, treat it as a regular log message
                log(data);
            }
        });

        // Run the Python script
        await ipcRenderer.invoke('run-python-script', options);
        
        // Complete the progress bar
        updateProgress(100);
        
        log('Processing completed!');
        
        // Reset state after a delay to show the completed progress
        setTimeout(() => {
            state.isProcessing = false;
            resetProgress();
            updateUI();
        }, 1000);
    } catch (error) {
        log(`Error during processing: ${error}`);
        state.isProcessing = false;
        resetProgress();
        updateUI();
    }
});

// Initialize UI
resetProgress();
updateUI();