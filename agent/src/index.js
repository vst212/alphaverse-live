const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');

const appVersion = '1.0.4';

const agent = new https.Agent({
    rejectUnauthorized: false
});

if (require('electron-squirrel-startup')) {
    app.quit();
}
let mainWindow;
let server;



const checkPageLoad = async () => {
    try {
        const result = await mainWindow.webContents.executeJavaScript('document.readyState');
        if (result !== 'complete') {
            throw new Error('Page did not load correctly');
        }
    } catch (error) {
        console.error('Error loading page:', error);
        mainWindow.reload(); // Reload the page if it didn't load correctly
    }
};

const createWindow = async () => {
    if (mainWindow) {
        mainWindow.destroy();
    }

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,
        },
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    await mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Check if the page loaded correctly
    mainWindow.webContents.on('did-finish-load', checkPageLoad);

    // Create HTTP server
    server = http.createServer(async (req, res) => {
        let body = [];
        req.on('data', (chunk) => {
            body.push(chunk);
        }).on('end', async () => {
            body = Buffer.concat(body).toString();
            const stakeMirror = await mainWindow.webContents.executeJavaScript(`localStorage.getItem('stakeMirror')`, true) || 'stake.com';

            const stakeCookies = await session.defaultSession.cookies.get({ url: `https://www.${stakeMirror}` }),
                cookieString = stakeCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

            const id = uuidv4();
            mainWindow.webContents.send('api-request', {
                id: id,
                apiKey: req.headers['x-access-token'],
                cookie: cookieString,
                body: body,
            });

            const listener = (event, response) => {
                res.write(JSON.stringify(response));
                res.end();
                ipcMain.removeListener(`api-response-${id}`, listener);
            };

            ipcMain.once(`api-response-${id}`, listener);

            setTimeout(() => ipcMain.removeListener(`api-response-${id}`, listener), 10000);
        });
    }).listen(8080);


};

app.on('ready', async () => {
    await createWindow();
});

app.on('window-all-closed', () => {

    if (server) {
        server.close();
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
    }
});
