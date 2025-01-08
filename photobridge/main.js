// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { PythonShell } = require('python-shell');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
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

        // Define the correct path to PhotoBridge.py
        const pythonScriptPath = path.join(__dirname, 'src/PhotoBridge.py');

        const pyshell = new PythonShell(pythonScriptPath, {
            mode: 'text',
            pythonPath: 'python3',
            args: args
        });

        pyshell.on('message', (message) => {
            mainWindow.webContents.send('python-output', message);
        });

        pyshell.on('stderr', (stderr) => {
            mainWindow.webContents.send('python-output', `Error: ${stderr}`);
        });

        pyshell.end((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
});

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