import { SIGNALING_SERVER_URL } from './config.js?v=mvvrqkfn';

export class NetworkManager extends EventTarget {
    constructor(iceServers = null) {
        super();
        this.mode = null;
        this.peerId = null;
        this.hostId = null;
        this.connections = new Map();
        this.socket = null;
        this.pendingCandidates = [];
        this.isHost = false;
        this.localMemberId = null;
        this.hostAsGm = false;
        this.iceServers = iceServers;
        this.reconnectTimer = null;
        this.signalingUrl = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.lastKnownAssignments = new Map();
        this.chatLog = [];
        this.readyPeers = new Set();
        this.lobbyStarted = false;
        this.turnTimer = null;
        this.turnTimeLeft = 0;
        this.turnTimerDuration = 0;
    }

    async startHost(signalingUrl = SIGNALING_SERVER_URL, options = {}) {
        this.mode = 'host';
        this.isHost = true;
        this.hostAsGm = options.hostAsGm ?? false;
        this.signalingUrl = signalingUrl;
        this.peerId = generatePeerId();
        await this.connectSignaling(signalingUrl, this.peerId);
        this.dispatchEvent(new CustomEvent('status', { detail: `Hosting as ${this.peerId}. Waiting for peers...` }));
        return this.peerId;
    }

    async joinHost(hostId, signalingUrl = SIGNALING_SERVER_URL, options = {}) {
        this.mode = 'client';
        this.isHost = false;
        this.hostId = hostId;
        this.hostAsGm = false;
        this.signalingUrl = signalingUrl;
        this.peerId = options.peerId || generatePeerId();
        await this.connectSignaling(signalingUrl, this.peerId);
        this.sendSignal({ type: 'join', target: hostId, sender: this.peerId, reconnect: options.reconnect || false });
        this.dispatchEvent(new CustomEvent('status', { detail: `Connecting to ${hostId}...` }));
    }

    connectSignaling(url, peerId) {
        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(`${url}?peer=${peerId}`);
                this.socket.onopen = () => {
                    this.reconnectAttempts = 0;
                    resolve();
                };
                this.socket.onerror = () => reject(new Error('Signaling server connection failed.'));
                this.socket.onmessage = event => this.handleSignalingMessage(JSON.parse(event.data));
                this.socket.onclose = () => {
                    this.dispatchEvent(new CustomEvent('status', { detail: 'Signaling server disconnected.' }));
                    this.scheduleReconnect();
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    scheduleReconnect() {
        if (this.mode !== 'client' || !this.hostId || this.reconnectAttempts >= this.maxReconnectAttempts) return;
        this.reconnectAttempts++;
        const delay = Math.min(30000, 2000 * Math.pow(2, this.reconnectAttempts - 1));
        this.dispatchEvent(new CustomEvent('status', { detail: `Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...` }));
        this.reconnectTimer = window.setTimeout(() => {
            this.joinHost(this.hostId, this.signalingUrl, { peerId: this.peerId, reconnect: true })
                .catch(() => this.scheduleReconnect());
        }, delay);
    }

    handleSignalingMessage(message) {
        if (message.type === 'join' && this.isHost) {
            this.acceptPeer(message.sender, message.reconnect);
            return;
        }
        if (message.type === 'offer') {
            this.handleOffer(message.sender, message.sdp);
            return;
        }
        if (message.type === 'answer') {
            this.handleAnswer(message.sender, message.sdp);
            return;
        }
        if (message.type === 'candidate') {
            this.handleCandidate(message.sender, message.candidate);
        }
    }

    async acceptPeer(peerId, reconnect = false) {
        const pc = this.createPeerConnection(peerId);
        const channel = pc.createDataChannel('game', { ordered: true });
        this.wrapChannel(peerId, channel, reconnect);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.sendSignal({ type: 'offer', target: peerId, sender: this.peerId, sdp: offer });
    }

    async handleOffer(peerId, sdp) {
        const pc = this.createPeerConnection(peerId);
        pc.ondatachannel = event => this.wrapChannel(peerId, event.channel);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal({ type: 'answer', target: peerId, sender: this.peerId, sdp: answer });
    }

    async handleAnswer(peerId, sdp) {
        const pc = this.connections.get(peerId)?.pc;
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    async handleCandidate(peerId, candidate) {
        const pc = this.connections.get(peerId)?.pc;
        if (!pc) return;
        if (!pc.remoteDescription) {
            this.pendingCandidates.push({ peerId, candidate });
            return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    createPeerConnection(peerId) {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        pc.onicecandidate = event => {
            if (event.candidate) {
                this.sendSignal({ type: 'candidate', target: peerId, sender: this.peerId, candidate: event.candidate });
            }
        };
        this.connections.set(peerId, { pc, channel: null });
        return pc;
    }

    wrapChannel(peerId, channel, reconnect = false) {
        const connection = this.connections.get(peerId);
        if (connection) connection.channel = channel;
        channel.onopen = () => {
            this.dispatchEvent(new CustomEvent('peerConnected', { detail: { peerId, channel, reconnect } }));
            this.dispatchEvent(new CustomEvent('status', { detail: `Peer ${peerId} connected.` }));
            this.sendTo(peerId, { type: 'lobbyState', readyPeers: Array.from(this.readyPeers), lobbyStarted: this.lobbyStarted });
        };
        channel.onclose = () => {
            this.dispatchEvent(new CustomEvent('peerDisconnected', { detail: { peerId } }));
            this.lastKnownAssignments.set(peerId, this.connections.get(peerId)?.assignedMemberId || this.lastKnownAssignments.get(peerId));
            this.connections.delete(peerId);
        };
        channel.onmessage = event => {
            this.dispatchEvent(new CustomEvent('message', { detail: { peerId, data: JSON.parse(event.data) } }));
        };
    }

    assignMember(peerId, memberId) {
        const connection = this.connections.get(peerId);
        if (connection) connection.assignedMemberId = memberId;
        this.lastKnownAssignments.set(peerId, memberId);
    }

    getAssignedMemberId(peerId) {
        return this.connections.get(peerId)?.assignedMemberId ?? null;
    }

    setLocalMemberId(memberId) {
        this.localMemberId = memberId;
    }

    sendSignal(payload) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(payload));
        }
    }

    broadcast(data) {
        const payload = JSON.stringify(data);
        for (const { channel } of this.connections.values()) {
            if (channel && channel.readyState === 'open') channel.send(payload);
        }
    }

    sendTo(peerId, data) {
        const channel = this.connections.get(peerId)?.channel;
        if (channel && channel.readyState === 'open') channel.send(JSON.stringify(data));
    }

    sendChat(text) {
        const message = { type: 'chat', sender: this.peerId, text, timestamp: Date.now() };
        this.chatLog.push(message);
        this.broadcast(message);
        return message;
    }

    setReady(ready) {
        const message = { type: 'ready', peerId: this.peerId, ready };
        if (this.isHost) {
            if (ready) this.readyPeers.add(this.peerId);
            else this.readyPeers.delete(this.peerId);
            this.broadcast(message);
            this.dispatchEvent(new CustomEvent('readyChanged', { detail: { peerId: this.peerId, ready, readyPeers: Array.from(this.readyPeers) } }));
        } else {
            this.sendTo(this.hostId, message);
        }
    }

    handleReady(peerId, ready) {
        if (!this.isHost) return;
        if (ready) this.readyPeers.add(peerId);
        else this.readyPeers.delete(peerId);
        this.broadcast({ type: 'ready', peerId, ready });
        this.dispatchEvent(new CustomEvent('readyChanged', { detail: { peerId, ready, readyPeers: Array.from(this.readyPeers) } }));
    }

    startGame() {
        if (!this.isHost) return;
        this.lobbyStarted = true;
        this.broadcast({ type: 'startGame' });
        this.dispatchEvent(new CustomEvent('startGame', { detail: {} }));
    }

    resetLobby() {
        this.lobbyStarted = false;
        this.readyPeers.clear();
        this.broadcast({ type: 'lobbyReset' });
        this.dispatchEvent(new CustomEvent('lobbyReset', { detail: {} }));
    }

    startTurnTimer(seconds) {
        this.stopTurnTimer();
        this.turnTimerDuration = seconds;
        this.turnTimeLeft = seconds;
        this.turnTimer = window.setInterval(() => {
            this.turnTimeLeft--;
            this.dispatchEvent(new CustomEvent('turnTick', { detail: { timeLeft: this.turnTimeLeft, duration: this.turnTimerDuration } }));
            if (this.turnTimeLeft <= 0) {
                this.stopTurnTimer();
                this.dispatchEvent(new CustomEvent('turnTimeout', { detail: {} }));
            }
        }, 1000);
    }

    stopTurnTimer() {
        if (this.turnTimer) {
            window.clearInterval(this.turnTimer);
            this.turnTimer = null;
        }
    }

    getRestoredAssignment(peerId) {
        return this.lastKnownAssignments.get(peerId) || null;
    }

    close() {
        for (const { pc } of this.connections.values()) pc.close();
        this.connections.clear();
        if (this.socket) this.socket.close();
        this.mode = null;
        this.stopTurnTimer();
    }
}

function generatePeerId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}
