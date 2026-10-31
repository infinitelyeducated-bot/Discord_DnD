// Headless playtest: plays the real game modules until every character reaches level 30,
// checking invariants and comparing behaviour against what the in-game guide promises.
import { webcrypto } from 'node:crypto';
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
if (!globalThis.crypto) globalThis.crypto = webcrypto;
class FakeAudio { constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; } close() {} resume() {} createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 } }; } createBiquadFilter() { return { connect() {}, frequency: {}, type: '' }; } }
globalThis.AudioContext = FakeAudio;

const { createGame, createPartyMember, activeMember } = await import('./modules/state.js');
const { generateMap, isWalkable } = await import('./modules/map.js');
const actions = await import('./modules/actions.js');
const { nearestAttackTarget, useItem } = await import('./modules/combat.js');
const { setMovementAllowance, experienceRequired } = await import('./modules/party.js');
const { ABILITIES, spellCharges } = await import('./modules/abilities.js');
const { ITEMS } = await import('./modules/config.js');

const issues = new Map();
function note(key, detail) { if (!issues.has(key)) issues.set(key, { count: 0, detail }); issues.get(key).count++; }

const difficulty = process.argv[2] || 'normal';
const game = createGame();
game.difficulty = difficulty;
for (const [n, c] of [['Aldric', 'fighter'], ['Brienne', 'rogue'], ['Cedric', 'wizard'], ['Dalia', 'cleric'], ['Elara', 'archer'], ['Finn', 'rogue']]) createPartyMember(game, n, c);
generateMap(game, activeMember(game), () => {});
game.party.forEach(m => setMovementAllowance(m));

const logs = [];
const text_tail = n => logs.slice(-n).map(l => l.msg).join(" / ");
const xpBySource = {};
const logMessage = (msg, member, actor) => { const xm = /gains (\d+) XP from ([\w ]+?) \(/.exec(msg); if (xm) xpBySource[xm[2]] = (xpBySource[xm[2]]||0) + Number(xm[1]); logs.push({ msg, who: member?.name || actor }); if (logs.length > 4000) logs.splice(0, 2000); };
const noop = () => {};
const OFF = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const stats = { turns: 0, abilityUses: { attack: 0, spell: 0, power: 0 }, floors: 1, maxFloor: 1, deaths: 0, stuckTurns: 0, potions: 0 };
const seenLevelUps = new Map();

function monsters() {
    const out = [];
    for (let y = 0; y < game.mapHeight; y++) for (let x = 0; x < game.mapWidth; x++) if (game.map[y][x] === 'M') out.push({ x, y });
    return out;
}

function checkInvariants(where) {
    for (const m of game.party) {
        for (const k of ['hp', 'maxHp', 'attack', 'defense', 'xp', 'level', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'movesRemaining']) {
            if (!Number.isFinite(m[k])) note(`NaN/undefined ${k}`, `${m.name} (${m.classKey}) ${k}=${m[k]} at ${where}`);
        }
        if (m.hp > m.maxHp) note('HP exceeds max HP', `${m.name} hp ${m.hp} > ${m.maxHp}`);
        if (m.hp < 0) note('Negative HP', `${m.name} hp ${m.hp}`);
        if (m.movesRemaining < 0) note('Negative movement', `${m.name} ${m.movesRemaining}`);
        if (m.level > 30) note('Level above cap 30', `${m.name} level ${m.level}`);
        if (typeof m.spellChargesLeft === 'number' && m.spellChargesLeft > spellCharges(m)) note('Spell charges above max', `${m.name} ${m.spellChargesLeft}>${spellCharges(m)}`);
        if (m.spellChargesLeft < 0) note('Negative spell charges', `${m.name}`);
        if (!Number.isInteger(m.strength) || !Number.isInteger(m.dexterity)) note('Stats become fractional after level-up', `${m.name} STR ${m.strength} DEX ${m.dexterity} (guide says +0.5 to others)`);
    }
    // map / monster table consistency
    for (let y = 0; y < game.mapHeight; y++) for (let x = 0; x < game.mapWidth; x++) {
        const hasM = game.map[y][x] === 'M';
        const rec = game.monsters[`${x},${y}`];
        if (hasM && !rec) note('Map shows M with no monster record (ghost monster)', `(${x},${y}) floor ${activeMember(game)?.dungeonLevel}`);
    }
    for (const key of Object.keys(game.monsters)) {
        const [x, y] = key.split(',').map(Number);
        if (game.map[y]?.[x] !== 'M') note('Monster record with no M on map (invisible monster)', `${key}`);
    }
}

// BFS over walkable/door/monster cells; returns first direction of the shortest path or null.
function firstStepToward(from, target) {
    const key = p => `${p.x},${p.y}`;
    if (from.x === target.x && from.y === target.y) return null;
    const prev = new Map([[key(from), null]]);
    const queue = [from];
    while (queue.length) {
        const cur = queue.shift();
        for (const d of Object.keys(OFF)) {
            const nx = cur.x + OFF[d][0], ny = cur.y + OFF[d][1];
            const k = `${nx},${ny}`;
            if (prev.has(k)) continue;
            const cell = game.map[ny]?.[nx];
            const isTarget = nx === target.x && ny === target.y;
            if (!isTarget && !(isWalkable(game, nx, ny) || cell === '+' || cell === 'M')) continue;
            prev.set(k, { from: key(cur), dir: d });
            if (isTarget) {
                let step = k;
                while (prev.get(step).from !== key(from)) step = prev.get(step).from;
                return prev.get(step).dir;
            }
            if (cell !== 'M') queue.push({ x: nx, y: ny });

        }
    }
    return null;
}

function tryMoveToward(member, target) {
    const best = firstStepToward(member.position, target);
    const order = best ? [best] : Object.keys(OFF);
    if (best) {
        const nx = member.position.x + OFF[best][0], ny = member.position.y + OFF[best][1];
        if (game.map[ny]?.[nx] === '+') {
            actions.move(game, best, logMessage, noop, null); // first bump opens the door (free)
        }
    }
    for (const d of order) {
        const nx = member.position.x + OFF[d][0], ny = member.position.y + OFF[d][1];
        const cell = game.map[ny]?.[nx];
        if (isWalkable(game, nx, ny) || cell === 'M' || cell === '+') {
            const before = { ...member.position }, mv = member.movesRemaining;
            actions.move(game, d, logMessage, noop, null);
            if (member.movesRemaining < mv || before.x !== member.position.x || before.y !== member.position.y) return true;
        }
    }
    return false;
}

let frontier = [];
function explorationTarget(member) {
    const exits = game.exitPositions || [];
    if (exits.length) return exits.reduce((a, b) => dist(member.position, a) <= dist(member.position, b) ? a : b);
    return null;
}

const MAX_TURNS = 60000;
const t0 = Date.now();
let lastProgress = 0, lastXpSum = 0;
let lastReport = Date.now();

while (stats.turns < MAX_TURNS) {
    if (game.gameOver) break;
    if (game.party.every(m => m.level >= 30)) break;
    if (Date.now() - t0 > 540000) { note('Playtest time limit hit', 'stopped before everyone reached 30'); break; }

    // the game may still be running an auto turn-end (last move spent); wait for it like a human would
    while (game.turnEnding) await new Promise(r => setTimeout(r, 5));
    const member = activeMember(game);
    stats.turns++;
    if (!member || member.hp <= 0) { await actions.finishTurn(game, logMessage, noop, null); continue; }
    const before = { idx: game.activeMemberIndex, hp: member.hp, xp: member.xp };

    // use potions when hurt
    if (member.hp < member.maxHp * 0.4 && member.inventory?.potion) { if (useItem(game, 'potion', member, logMessage)) stats.potions++; }
    for (const k of ['scroll', 'haste', 'antidote']) {
        if (member.inventory?.[k] && (k !== 'antidote' || member.statusEffects?.some(e => e.type === 'poison'))) useItem(game, k, member, logMessage);
    }

    // heal with cleric when anyone is hurt
    if (member.classKey === 'cleric' && member.spellChargesLeft > 0 && game.party.some(p => p.hp > 0 && p.hp < p.maxHp * 0.6)) {
        const hpsBefore = game.party.map(p => p.hp);
        const used = actions.castAbility(game, 'spell', logMessage, noop, null);
        stats.abilityUses.spell++;
        if (activeMember(game) !== member || game.party.some((p, i) => p.hp > hpsBefore[i])) { checkInvariants('cleric heal'); continue; }
    }

    // rest when low
    if (member.hp < member.maxHp * 0.35 && member.movesRemaining > 0) { actions.rest(game, logMessage, noop, null); checkInvariants('rest'); continue; }

    // combat: choose best available ability
    const mons = monsters();
    const near = mons.filter(m => dist(m, member.position) <= 5);
    if (near.length) {
        const kit = ABILITIES[member.classKey];
        const slotOrder = member.classKey === 'cleric' ? ['power', 'attack'] : ['power', 'spell', 'attack'];
        let acted = false;
        for (const slot of slotOrder) {
            if (slot === 'spell' && (member.spellChargesLeft ?? 99) < 1) continue;
            if (slot === 'power' && (member.powerCooldown || 0) > 0) continue;
            const idxBefore = game.activeMemberIndex;
            const monsterCountBefore = mons.length;
            const cdBefore = member.powerCooldown, chBefore = member.spellChargesLeft;
            actions.castAbility(game, slot, logMessage, noop, null);
            const consumed = game.activeMemberIndex !== idxBefore || game.gameOver;
            if (consumed) {
                stats.abilityUses[slot]++;
                if (slot === 'power' && !(member.powerCooldown >= kit.power.cooldown - 1)) note('Power attack cooldown not applied after use', `${member.name} ${slot} cd=${member.powerCooldown}`);
                if (slot === 'spell' && member.spellChargesLeft >= chBefore) note('Spell did not consume a charge', `${member.name}`);
                acted = true;
                break;
            }
        }
        if (acted) { checkInvariants('ability'); continue; }
        // not in range for abilities: try basic attack key
        if (nearestAttackTarget(game, member)) { actions.attack(game, logMessage, noop, null); checkInvariants('attack'); continue; }
    }

    // descend when adjacent to exit (walk there honestly)
    const exit = explorationTarget(member);
    // Hunt monsters while there are some; otherwise head for the stairs.
    const nearestMon = mons.length ? mons.reduce((a, b) => dist(member.position, a) <= dist(member.position, b) ? a : b) : null;
    // Clear the floor of monsters before taking the stairs so combat gets exercised,
    // but give up on a floor after a while (fleeing goblins can kite forever).
    stats.floorTurns = (stats.floorTurns || 0) + 1;
    if (member.dungeonLevel !== stats.lastFloorSeen) { stats.lastFloorSeen = member.dungeonLevel; stats.floorTurns = 0; }
    const hunt = nearestMon && stats.floorTurns < 300;
    const target = near.length ? near[0] : (hunt ? nearestMon : exit);
    const prevFloor = member.dungeonLevel;
    let moved = false;
    for (let step = 0; step < 14 && member.movesRemaining > 0 && member === activeMember(game); step++) {
        const tgt = target || exit || { x: member.position.x + 3, y: member.position.y };
        if (!tryMoveToward(member, tgt)) { // random wiggle when stuck
            const d = Object.keys(OFF)[Math.floor(Math.random() * 4)];
            actions.move(game, d, logMessage, noop, null);
        }
        moved = true;
        if (game.gameOver) break;
        if (member.dungeonLevel !== prevFloor) { stats.floors++; break; }
        // stairs: standing on exit
        if ((game.exitPositions || []).some(e => e.x === member.position.x && e.y === member.position.y) && member.dungeonLevel === prevFloor) break;
    }
    if (member === activeMember(game) && (game.exitPositions || []).some(e => dist(e, member.position) <= 0)) {
        if (typeof actions.descendFloor === 'function') { actions.descendFloor(game, member, logMessage); }
    }
    while (game.turnEnding) await new Promise(r => setTimeout(r, 5));
    if (member === activeMember(game)) await actions.finishTurn(game, logMessage, noop, null);
    while (game.turnEnding) await new Promise(r => setTimeout(r, 5));
    checkInvariants('turn');

    // stuck detection
    const xpSum = game.party.reduce((s, m) => s + m.xp + m.level * 1000, 0);
    if (xpSum === lastXpSum) { stats.stuckTurns++; } else { stats.stuckTurns = 0; lastXpSum = xpSum; }
    if (stats.stuckTurns === 200 || stats.stuckTurns === 1400) {
        console.log(`[stuck ${stats.stuckTurns}] active=${member.name} pos=${JSON.stringify(member.position)} moves=${member.movesRemaining} turnEnding=${game.turnEnding} target=${JSON.stringify(target)} exit=${JSON.stringify(exit)} near=${near.length} firstStep=${firstStepToward(member.position, target || exit || member.position)}`);
        console.log('  party:', game.party.map(p => `${p.name}@${p.position?.x},${p.position?.y} hp${p.hp}`).join(' | '));
        console.log('  last log:', text_tail(6));
        if (stats.stuckTurns === 200) { const cx = member.position.x, cy = member.position.y; const rows = []; for (let y = Math.max(0, cy - 8); y <= Math.min(game.mapHeight - 1, cy + 8); y++) { let row = ''; for (let x = Math.max(0, cx - 20); x <= Math.min(game.mapWidth - 1, cx + 20); x++) { const p = game.party.find(q => q.position?.x === x && q.position?.y === y); row += p ? p.marker : game.map[y][x]; } rows.push(row); } console.log(rows.join('\n')); console.log('doors near:', Object.values(game.doors).filter(d => Math.abs(d.x - cx) + Math.abs(d.y - cy) < 25).map(d => `${d.x},${d.y}:${d.open ? 'open' : 'closed'}${d.locked ? ' LOCKED' : ''}`).join(' ')); console.log('party inventories:', game.party.map(p => JSON.stringify(p.inventory)).join(' ')); }
    }
    if (stats.stuckTurns === 1500) { note('No XP/level progress for 3000 turns (bot stuck or game softlock)', `floor ${member.dungeonLevel}, pos ${JSON.stringify(member.position)}, monsters left ${monsters().length}, exits ${JSON.stringify(game.exitPositions)}`); break; }

    stats.maxFloor = Math.max(stats.maxFloor, ...game.party.map(p => p.dungeonLevel));
    if (Date.now() - lastReport > 20000) { lastReport = Date.now(); console.log(`[progress] turns ${stats.turns} floor ${stats.maxFloor} levels ${game.party.map(p => p.level).join('/')} alive ${game.party.filter(p => p.hp > 0).length}`); }
}

// --- scan the log for claims vs behaviour ---
const text = logs.map(l => l.msg);
const has = re => text.some(t => re.test(t));
const count = re => text.filter(t => re.test(t)).length;
const sample = {
    logLines: logs.length,
    levelUp: count(/reaches level/),
    deaths: count(/has fallen permanently|is down!/),
    deathSaves: count(/death saving throw/),
    revived: count(/revived|back from the dead/),
    poisonLines: count(/poison/i),
    pinnedLines: count(/pinned and slowed/),
    monsterTurnsLines: count(/Monster Phase/)
};

// Does monster poison/slow ever do anything? (the abilities set monster.poisoned / monster.slowed)
import { readFileSync } from 'node:fs';
const combatSrc = readFileSync('./modules/combat.js', 'utf8');
if (!/\.slowed/.test(combatSrc)) note('Pinning Shot "slows" a monster but monster.slowed is never read (no effect)', 'abilities.js sets target.monster.slowed; combat.js never checks it');
if (!/\.poisoned/.test(combatSrc)) note('Poison Vial "poisons" a monster but monster.poisoned is never read (no damage over time)', 'abilities.js sets target.monster.poisoned; combat.js never applies it');
sample.poisonTicks = count(/takes \d+ poison damage/);
sample.pinSkips = count(/is pinned and cannot act/);
sample.bossLines = count(/Bone Tyrant|Molten Colossus|Frost Lich|Swarm Queen|Shadow Dragon/);
sample.walkXp = xpBySource['movement'] || 0;
sample.exploreXp = xpBySource['exploring'] || 0;
if (sample.walkXp) note('Movement still grants XP on revisited tiles', `movement XP ${sample.walkXp}`);

const finalLevels = game.party.map(m => `${m.name} (${m.classKey}) L${m.level} ${m.hp}/${m.maxHp}HP STR${m.strength} DEX${m.dexterity} INT${m.intelligence} WIS${m.wisdom} powerItems ${m.powerItems}`);
console.log('\n=== PLAYTEST RESULT ===');
console.log('difficulty:', difficulty, '| turns:', stats.turns, '| gameOver:', game.gameOver, '| deepest floor:', stats.maxFloor, '| minutes:', ((Date.now() - t0) / 60000).toFixed(1));
console.log('ability uses:', JSON.stringify(stats.abilityUses), '| potions drunk:', stats.potions);
console.log(finalLevels.join('\n'));
console.log('XP by source:', JSON.stringify(xpBySource));
console.log('log stats:', JSON.stringify(sample));
console.log('\n=== ISSUES ===');
if (!issues.size) console.log('none detected');
for (const [k, v] of issues) console.log(`- ${k} (x${v.count}): ${v.detail}`);
console.log('\nlast 12 log lines:');
console.log(text.slice(-12).join('\n'));
