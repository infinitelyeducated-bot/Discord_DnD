import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = Number(process.env.PORT) || 8080;
const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let filePath = req.url.split('?')[0];
    if (filePath === '/') filePath = '/crawler.html';
    const fullPath = path.join(__dirname, filePath);
    const ext = path.extname(fullPath).toLowerCase();

    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(data);
    });
});

const wss = new WebSocketServer({ server });
const peers = new Map(); // peerId -> ws

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const peerId = url.searchParams.get('peer');
    if (!peerId) {
        ws.close();
        return;
    }
    peers.set(peerId, ws);
    console.log(`Peer connected: ${peerId}`);

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            const target = data.target;
            if (target && peers.has(target)) {
                peers.get(target).send(JSON.stringify({ ...data, sender: peerId }));
            }
        } catch (error) {
            console.error('Invalid signaling message:', error);
        }
    });

    ws.on('close', () => {
        peers.delete(peerId);
        console.log(`Peer disconnected: ${peerId}`);
    });
});

function startServer(port = DEFAULT_PORT) {
    server.listen(port, () => {
        const addresses = getLocalAddresses();
        console.log(`PixelBear Dungeon Crawler server running on port ${port}`);
        console.log('Local URLs:');
        for (const addr of addresses) {
            console.log(`  http://${addr}:${port}/crawler.html`);
        }
    }).on('error', error => {
        if (error.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Server error:', error);
            process.exit(1);
        }
    });
}

startServer();

function getLocalAddresses() {
    const nets = os.networkInterfaces();
    const result = ['localhost'];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                result.push(net.address);
            }
        }
    }
    return [...new Set(result)];
}
