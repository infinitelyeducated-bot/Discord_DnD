// Dice system adapted from the DM Toolkit (crypto-secure rolls).
export const DICE = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, 'd%': 100 };

export function rnd(n) {
    const a = new Uint32Array(1);
    const lim = Math.floor(4294967296 / n) * n;
    do crypto.getRandomValues(a); while (a[0] >= lim);
    return a[0] % n + 1;
}

export function rollDice(count, sides, mod = 0) {
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(rnd(sides));
    const sum = rolls.reduce((a, b) => a + b, 0);
    return { rolls, sides, mod, total: sum + mod };
}

export function formatRoll(result, label = '') {
    const modText = result.mod ? ` ${result.mod > 0 ? '+' : '−'} ${Math.abs(result.mod)}` : '';
    return `${label ? label + ': ' : ''}[${result.rolls.join(', ')}]${modText} = ${result.total}`;
}

// Listeners so the dice panel can display rolls made by game events.
const listeners = [];
export function onGameRoll(fn) { listeners.push(fn); }
export function emitGameRoll(detail) {
    for (const fn of listeners) {
        try { fn(detail); } catch { /* ignore */ }
    }
}

// Roll and announce to the dice panel in one step.
export function gameRoll(count, sides, mod, label) {
    const result = rollDice(count, sides, mod);
    emitGameRoll({ ...result, count, label });
    return result;
}
