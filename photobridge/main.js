const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { PythonShell } = require('python-shell');
const path = require('path');

// Determine if we're in development or production
const isDev = process.env.NODE_ENV === 'development';

// Helper function to get correct Python path
const getPythonPath = () => {
    if (isDev) {
        return 'python3';
    }
    // In production, use the bundled Python
    if (process.platform === 'darwin') { // macOS
        return path.join(process.resourcesPath, 'python', 'venv', 'bin', 'python3');
    }
    // Add support for other platforms if needed
    return path.join(process.resourcesPath, 'python', 'venv', 'bin', 'python3');
};

// Helper function to get correct script paths
const getScriptPath = (scriptName) => {
    if (isDev) {
        return path.join(__dirname, '../src', scriptName);
    }
    return path.join(process.resourcesPath, 'src', scriptName);
};

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,  // Increased width for the new layout
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');

    // Open DevTools in development mode
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(createWindow);

// Handle directory selection
ipcMain.handle('select-directory', () => {
    return dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
});

// Handle file selection
ipcMain.handle('select-file', (event, filters) => {
    return dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: filters
    });
});

// Handle Python script execution
ipcMain.handle('run-python-script', (event, options) => {
    return new Promise((resolve, reject) => {
        const args = [];
        
        if (options.dir) {
            args.push(`--dir=${options.dir}`);
        } else {
            if (options.photo) args.push(`--photo=${options.photo}`);
            if (options.video) args.push(`--video=${options.video}`);
        }
        
        if (options.output) args.push(`--output=${options.output}`);
        if (options.recurse) args.push('--recurse');
        if (options.heic) args.push('--heic');

        // Get the correct path to PhotoBridge.py
        const pythonScriptPath = getScriptPath('PhotoBridge.py');

        // Configure PythonShell with the correct Python interpreter
        const pyshell = new PythonShell(pythonScriptPath, {
            mode: 'text',
            pythonPath: getPythonPath(),
            args: args
        });

        // Handle Python script output
        pyshell.on('message', (message) => {
            mainWindow.webContents.send('python-output', message);
        });

        // Handle Python script errors
        pyshell.on('stderr', (stderr) => {
            mainWindow.webContents.send('python-output', `Error: ${stderr}`);
        });

        // Handle script completion
        pyshell.end((err) => {
            if (err) {
                console.error('Python script error:', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
});

// Platform specific app behaviors
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle any uncaught errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Optional: Add logging for debugging production issues
if (!isDev) {
    const logPath = path.join(app.getPath('userData'), 'logs.txt');
    const fs = require('fs');
    
    console.log = (...args) => {
        fs.appendFileSync(logPath, args.join(' ') + '\n');
    };
    
    console.error = (...args) => {
        fs.appendFileSync(logPath, 'ERROR: ' + args.join(' ') + '\n');
    };
}