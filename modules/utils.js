export function positionKey(x, y) {
    return `${x},${y}`;
}

export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

export function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}



export function generateId(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatModifier(value) {
    return value >= 0 ? `+${value}` : `${value}`;
}

export function distance(a, b) {
    if (!a || !b) return Infinity;
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
