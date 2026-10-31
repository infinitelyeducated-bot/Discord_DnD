// Discord relay — server side, appended to the existing server.js
// (uses the same wss/http server; purely additive, never touches signaling).

import { Client, GatewayIntentBits } from 'discord.js';
import { WebSocketServer } from 'ws';

const CONFIG = readDiscordConfig();
let discordClient = null;
const relayPages = new Set();   // live /relay sockets that want discordChat

function readDiscordConfig() {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, 'discord-config.json'), 'utf8'));
    } catch { return null; }
}


function resolveChannelByName(client) {
    const name = CONFIG.channelName;
    if (!name || CONFIG.channelId) return;
    const found = client.channels.cache.find(c => c.name === name && c.isTextBased && c.isTextBased());
    if (found) {
        CONFIG.channelId = found.id;
        console.log('Discord relay: resolved channel #' + name + ' (' + found.id + ')');
    } else {
        console.log('Discord relay: could not find a text channel named #' + name + ' on this server');
    }
}

async function startDiscordRelay() {
    if (!CONFIG || !CONFIG.token || !CONFIG.channelId) {
        console.log('Discord relay: off (discord-config.json missing or empty)');
        return null;
    }
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    client.on('ready', () => {
        console.log('Discord relay: online as ' + client.user.tag);
        resolveChannelByName(client);
    });
    client.on('messageCreate', msg => {
        if (msg.channel.id !== CONFIG.channelId || msg.author.bot) return;
        const text = msg.content.trim();
        if (!text) return;
        const payload = { type: 'discordChat', sender: msg.author.displayName || msg.author.username, text, timestamp: Date.now(), discUserId: msg.author.id };
        for (const ws of relayPages) {
            try { ws.send(JSON.stringify(payload)); } catch {}
        }
        console.log('Discord < ' + payload.sender + ': ' + text.slice(0, 60));
    });
    try {
        await client.login(CONFIG.token);
        discordClient = client;
        return client;
    } catch (e) {
        console.log('Discord relay: login failed — ' + e.message);
        return null;
    }
}

// Rate-limited queue -> Discord: max ~5 messages / 5 s, chunked at 1800 chars.
const queue = [];
let flushing = false;
async function flushQueue() {
    if (flushing || !discordClient || !CONFIG) return;
    flushing = true;
    try {
        const channel = await discordClient.channels.fetch(CONFIG.channelId);
        if (!channel?.isSendable && !channel?.isTextBased) {
            console.log('Discord relay: channel not writeable');
            return;
        }
        while (queue.length) {
            const item = queue.shift();
            const chunks = item.text.match(/[\s\S]{1,1800}/g) || [item.text];
            for (const chunk of chunks) {
                try { await channel.send(chunk); } catch (e) { console.log('Discord send failed: ' + e.message); }
                await new Promise(r => setTimeout(r, 350));
            }
        }
    } catch (e) {
        console.log('Discord relay: ' + e.message);
    } finally {
        flushing = false;
        if (queue.length) setTimeout(flushQueue, 400);
    }
}
function relayToDiscord(text, label) {
    if (!CONFIG || !discordClient) return false;
    queue.push({ text: (label ? '**' + label + '**' + (text ? ' ' + text : '') : text).slice(0, 1900) });
    if (!flushing) flushQueue();
    return true;
}

export function attachRelay(server, signalWss) {
    const relayWss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
        try {
            const u = new URL(req.url, 'http://x');
            if (u.pathname === '/relay') {
                relayWss.handleUpgrade(req, socket, head, ws => relayWss.emit('connection', ws, req));
            } else if (u.pathname === '/signal') {
                signalWss.handleUpgrade(req, socket, head, ws => signalWss.emit('connection', ws, req));
            } else {
                socket.destroy();
            }
        } catch (e) { socket.destroy(); }
    });
relayWss.on('connection', (ws) => {
    relayPages.add(ws);
    console.log('Relay page connected (' + relayPages.size + ' open)');
    ws.send(JSON.stringify({
        type: 'discordStatus',
        on: Boolean(discordClient),
        config: CONFIG ? { isDm: Boolean(CONFIG.isDm), bubbleMs: CONFIG.bubbleMs || 4000 } : null
    }));
    ws.on('message', raw => {
        try {
            const data = JSON.parse(raw);
            if (data.type === 'relayChat') relayToDiscord(data.text || '', data.sender || '');
            else if (data.type === 'relayLog') relayToDiscord(data.text || '', data.sender || '');
        } catch {}
    });
    ws.on('close', () => relayPages.delete(ws));
});

    startDiscordRelay();
}