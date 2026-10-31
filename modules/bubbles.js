// Chat bubbles over characters. A bubble belongs to a party member (by member
// id) or falls back to a floating tag near the map viewport for senders that
// have no character. Bubbles fade out after BUBBLE_MS and are placed once per
// frame (the map is a scrolled grid, so a bubble must track its cell).
import { renderFloatingTexts, updateFloatingTexts } from './ui.js?v=mvwqbkdq';

let BUBBLE_MS = 4000;
const MAX_BUBBLES = 8     // hard cap per page so a chat storm can't leak DOM
const BUBBLE_FONT = '0.78rem'

const activeBubbles = new Map()   // memberId -> {text, color, born, el}
let fallbackQueue = []            // {text, color, born} for senders w/o a character

export function setBubbleDuration(ms) { /* tuning hook; default 4000 */ }

function nameColor(name) {
    // deterministic pastel from the name, so a Discord user keeps one colour
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return `hsl(${hue} 85% 72%)`;
}

export function showChatBubble(member, text, senderName = member?.name || '') {
    if (!document.getElementById('dungeon-map')) return;
    const id = member?.id;
    const color = nameColor(senderName || member?.name || '?');
    if (id) {
        const existing = activeBubbles.get(id);
        if (existing) { existing.text = text; existing.born = performance.now(); }
        else {
            const el = createBubbleEl(text, color);
            activeBubbles.set(id, { text, color, born: performance.now(), el });
        }
    } else {
        fallbackQueue.push({ text, color, born: performance.now() });
        if (fallbackQueue.length > 4) fallbackQueue.shift();
    }
    trimToMax();
}

function createBubbleEl(text, color) {
    const el = document.createElement('div');
    el.className = 'chat-bubble';
    el.textContent = text;
    el.style.color = color;
    el.style.borderColor = color;
    document.getElementById('bubble-layer').appendChild(el);  // end of map
    return el;
}

function trimToMax() {
    while (activeBubbles.size > MAX_BUBBLES) {
        const oldest = [...activeBubbles.entries()].sort((a, b) => a[1].born - b[1].born)[0];
        if (!oldest) break;
        oldest[1].el?.remove();
        activeBubbles.delete(oldest[0]);
    }
}

// Called every frame by the existing floating-text loop.
export function updateBubbles(deltaTime) {
    const now = performance.now();
    for (const [id, b] of activeBubbles) {
        if (now - b.born > BUBBLE_MS) { b.el?.remove(); activeBubbles.delete(id); continue; }
        positionBubble(b.el, id);
    }
    fallbackQueue = fallbackQueue.filter(f => now - f.born < BUBBLE_MS);
    renderFallback(fallbackQueue);
}

function positionBubble(el, memberId) {
    const viewport = document.getElementById('dungeon-map');
    const cell = document.querySelector(`#dungeon-map-content .map-cell[data-x][data-y]`);
    if (!viewport || !cell) return;
    const cellRect = cell.getBoundingClientRect();
    const viewRect = viewport.getBoundingClientRect();
    const fontSize = parseFloat(viewport.style.fontSize) || 10;
    el.style.left = `${cellRect.left - viewRect.left + viewport.scrollLeft + fontSize / 2}px`;
    el.style.top = `${cellRect.top - viewRect.top + viewport.scrollTop - fontSize - 24}px`;
}

function renderFallback(queue) {
    const viewport = document.getElementById('dungeon-map');
    if (!viewport) return;
    const layer = document.getElementById('bubble-layer');
    // reuse the floating-text layer for fallback tags (they have no cell)
    const existing = layer?.querySelector('.chat-bubble-fallback');
    if (existing && queue.length === 0) { existing.remove(); return; }
    if (queue.length === 0) return;
    let el = existing;
    if (!el) { el = document.createElement('div'); el.className = 'chat-bubble-fallback'; layer?.appendChild(el); }
    const top = queue[queue.length - 1];
    el.textContent = top.text;
    el.style.color = top.color;
}

// ── wiring helpers ──────────────────────────────────────────────────────────

// Takes a chat/log message (peer-chat, discord-chat, or the local submit) and
// shows a bubble on the speaker's character (or a corner tag).
export function handleChatBubble(message) {
    const member = memberFromMessage(message);
    const text = String(message.text || message.message || '').slice(0, 80);
    if (!text) return;
    showChatBubble(member, text, prettySender(message.sender));
}

export function memberFromMessage(message) {
    const game = window.__pdcGame;
    if (!game) return null;
    // by member id if the message carries one
    if (message.memberId) return game.party.find(m => m.id === message.memberId) || null;
    // (LAN peer-to-member assignment removed in this edition)
    // by name
    if (message.sender && typeof message.sender === 'string') {
        return game.party.find(m => m.name.toLowerCase() === message.sender.toLowerCase()) || null;
    }
    return null;
}

export function prettySender(sender) {
    if (!sender) return '';
    return String(sender).replace(/^peer-/, '').slice(0, 14);
}


export function bindBubbles(game) {
    window.__pdcGame = game;
}
