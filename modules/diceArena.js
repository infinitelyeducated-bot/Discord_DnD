// Animated digital dice arena — fixed overlay in the bottom-right corner.
// Die shapes are ported from the DM Toolkit's roller (SVG polygons per type);
// here they tumble in, land on their value, glow on crit/fail, and fade.

const DICE_SHAPES = {
    d4: '50,6 94,88 6,88',
    d6: '14,14 86,14 86,86 14,86',
    d8: '50,4 92,50 50,96 8,50',
    d10: '50,4 90,38 76,90 24,90 10,38',
    d12: '50,4 86,30 72,74 28,74 14,30',
    d20: '50,4 88,25 88,65 50,88 12,65 12,25',
    'd%': '50,6 88,32 76,78 24,78 12,32'
};

function dieSvg(type) {
    const pts = DICE_SHAPES[type] || DICE_SHAPES.d20;
    const fill = type === 'd%' ? '#6c4a9c' : '#8e2b20';
    return `<svg viewBox="0 0 100 100" class="arena-die-svg">
        <polygon points="${pts}" fill="${fill}" stroke="#d4a73a" stroke-width="4" />
        <text x="50" y="56" text-anchor="middle" font-size="26" fill="#f1e6d0" font-family="Georgia">${type}</text>
    </svg>`;
}

export function showDiceArena(rolls, type = 'd20', opts = {}) {
    let arena = document.getElementById('dice-arena');
    if (!arena) {
        arena = document.createElement('div');
        arena.id = 'dice-arena';
        arena.className = 'dice-arena';
        document.body.appendChild(arena);
    }
    const cell = document.createElement('div');
    cell.className = 'dice-arena-batch';
    const shown = rolls.slice(0, 6);
    cell.innerHTML = shown.map(v => {
        const crit = type === 'd20' && v === 20;
        const fail = type === 'd20' && v === 1;
        return `<div class="arena-die${crit ? ' arena-crit' : ''}${fail ? ' arena-fail' : ''}" style="animation-delay:${Math.random() * 0.18}s">
            ${dieSvg(type)}
            <div class="arena-value">${v}</div>
        </div>`;
    }).join('');
    if (rolls.length > shown.length) {
        const more = document.createElement('div');
        more.className = 'arena-more';
        more.textContent = '+ ' + (rolls.length - shown.length) + ' more';
        cell.appendChild(more);
    }
    if (opts.label) {
        const label = document.createElement('div');
        label.className = 'arena-label';
        label.textContent = opts.label;
        cell.prepend(label);
    }
    arena.appendChild(cell);
    // cap the stack: oldest batches fade first
    while (arena.children.length > 4) arena.firstElementChild.remove();
    setTimeout(() => {
        cell.classList.add('arena-out');
        setTimeout(() => cell.remove(), 700);
    }, 2800);
}
