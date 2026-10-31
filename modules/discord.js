// Discord relay — page side. Connects to the server's /relay WebSocket. In
// the DM's copy it also relays the party chat and action log into the Discord
// channel; in every copy it receives players' Discord messages and turns them
// into chat lines + bubbles (modules/bubbles.js).
//
// Quietly turns itself off when the server has no relay configured, so the
// game behaves exactly as before.

const STATUS_KEY = 'ddnd.discord.status';

export class DiscordRelay {
    constructor() {
        this.socket = null;
        this.on = false;
        this.isDm = false;
        this.bubbleMs = 4000;
        this.reconnectTimer = null;
        this.pending = [];
        this.listeners = new Set();
    }

    connect() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const url = `${proto}://${location.host}/relay`;
        try {
            this.socket = new WebSocket(url);
        } catch {
            this._setStatus('Relay unavailable');
            return;
        }
        this.socket.onopen = () => {
            this._setStatus('Relay: connecting…');
            for (const p of this.pending.splice(0)) this.send(p);
        };
        this.socket.onmessage = e => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'discordStatus') {
                    this.on = Boolean(data.on);
                    this.isDm = Boolean(data.config?.isDm);
                    this.bubbleMs = data.config?.bubbleMs || 4000;
                    this._setStatus(this.on ? 'Discord relay: on' : 'Discord relay: off');
                    this.emit('status');
                } else if (data.type === 'discordChat') {
                    this.emit('chat', data);
                }
            } catch {}
        };
        this.socket.onclose = () => {
            this._setStatus('Relay: reconnecting…');
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 4000);
        };
        this.socket.onerror = () => this.socket?.close();
    }

    send(payload) {
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
        else this.pending.push(payload);
    }

    // The DM's copy relays its own chat and the action log.
    relayChat(text, label) {
        if (!this.on || !this.isDm) return false;
        this.send({ type: 'relayChat', text, sender: label });
        return true;
    }
    relayLog(text, label) {
        if (!this.on || !this.isDm) return false;
        this.send({ type: 'relayLog', text, sender: label });
        return true;
    }

    onEvent(type, fn) { this.listeners.add({ type, fn }); return () => this.listeners.delete({ type, fn }); }
    emit(type, data) { for (const l of this.listeners) if (l.type === type) l.fn(data); }

    _setStatus(text) {
        try {
            sessionStorage.setItem(STATUS_KEY, text);
            const el = document.getElementById('discord-status');
            if (el) el.textContent = text;
        } catch {}
    }
}
