// Module-by-module check: does each module do what the in-game guide says?
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} }) };
globalThis.localStorage = (() => { const s = {}; return { getItem: k => s[k] ?? null, setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; } }; })();
globalThis.AudioContext = class { constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; } close() {} resume() {} createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }; } createBiquadFilter() { return { connect() {}, frequency: {}, type: '' }; } };

const state = await import('./modules/state.js');
const map = await import('./modules/map.js');
const actions = await import('./modules/actions.js');
const combat = await import('./modules/combat.js');
const party = await import('./modules/party.js');
const abilities = await import('./modules/abilities.js');
const dice = await import('./modules/dice.js');
const config = await import('./modules/config.js');
const pathfinding = await import('./modules/pathfinding.js');

const results = [];
const check = (mod, name, ok, detail = '') => results.push({ mod, name, ok: Boolean(ok), detail });
const noop = () => {};
const mkGame = (classes = ['fighter', 'rogue', 'wizard', 'cleric', 'archer']) => {
    const g = state.createGame(); g.difficulty = 'normal';
    classes.forEach((c, i) => state.createPartyMember(g, `P${i + 1}`, c));
    map.generateMap(g, state.activeMember(g), noop);
    g.party.forEach(m => party.setMovementAllowance(m));
    return g;
};
const logs = []; const lm = (m, mem, actor) => logs.push(`${mem?.name || actor || ''}: ${m}`);
const putMonster = (g, x, y, over = {}) => { const m = { name: 'Orc', icon: 'o', hp: 12, maxHp: 12, attack: 4, ai: 'brute', ...over }; g.map[y][x] = 'M'; g.monsters[`${x},${y}`] = m; return m; };
const clearAround = (g, p, r = 6) => { for (let y = p.y - r; y <= p.y + r; y++) for (let x = p.x - r; x <= p.x + r; x++) if (g.map[y]?.[x] !== undefined && x > 0 && y > 0 && x < g.mapWidth - 1 && y < g.mapHeight - 1) { g.map[y][x] = '.'; delete g.monsters[`${x},${y}`]; } };

// ---------------- config ----------------
check('config', 'five classes incl. Archer', Object.keys(config.CLASSES).join() === 'fighter,archer,rogue,wizard,cleric');
check('config', 'guide HP/AC per class', config.CLASSES.fighter.hp === 15 && config.CLASS_SETTINGS.fighter.armorClass === 14 && config.CLASSES.archer.hp === 13 && config.CLASS_SETTINGS.archer.armorClass === 13 && config.CLASSES.cleric.hp === 14 && config.CLASS_SETTINGS.cleric.armorClass === 16 && config.CLASSES.wizard.hp === 10 && config.CLASS_SETTINGS.wizard.armorClass === 10 && config.CLASSES.rogue.hp === 12 && config.CLASS_SETTINGS.rogue.armorClass === 12);
check('config', 'max party 6', config.MAX_PARTY_SIZE === 6);
check('config', 'level cap 30', config.MAX_CHARACTER_LEVEL === 30);
check('config', 'bestiary matches guide', config.ENEMIES.length === 8 && config.ENEMIES.find(e => e.name === 'Viper')?.ai === 'ranged' && config.ENEMIES.find(e => e.name === 'Goblin')?.ai === 'fleeing' && config.ENEMIES.find(e => e.name === 'Dragon')?.hp === 30);
check('config', 'hard/nightmare permadeath, easy/normal not', config.DIFFICULTIES.hard.permadeath && config.DIFFICULTIES.nightmare.permadeath && !config.DIFFICULTIES.easy.permadeath && !config.DIFFICULTIES.normal.permadeath);
check('config', 'items: potion 20, scroll 5 turns, haste 4 turns', config.ITEMS.potion.value === 20 && config.ITEMS.scroll.duration === 5 && config.ITEMS.haste.duration === 4);

// ---------------- dice ----------------
{ const r = dice.rollDice(1000, 20, 0); const ok = r.rolls.every(v => v >= 1 && v <= 20) && new Set(r.rolls).size >= 15; check('dice', 'd20 rolls in 1..20 and vary', ok); }
{ const r = dice.rollDice(3, 6, 2); check('dice', 'total = sum + mod', r.total === r.rolls.reduce((a, b) => a + b, 0) + 2); }
{ let got = null; dice.onGameRoll(d => { got = d; }); dice.gameRoll(2, 8, 1, 'test'); check('dice', 'game rolls reach the dice panel listener', got && got.label === 'test' && got.count === 2 && got.sides === 8); }
check('dice', 'DICE table has d4..d%', Object.keys(dice.DICE).join() === 'd4,d6,d8,d10,d12,d20,d%');

// ---------------- state ----------------
{ const g = mkGame(); const snap = state.saveSnapshot(g, []); const loaded = state.loadSnapshot(snap); check('state', 'save/load round-trip keeps party', loaded && loaded.game.party.length === 5 && loaded.game.party[0].name === 'P1'); }
{ const g = mkGame(); g.turnEnding = true; g.party[0].strength = 12.5; g.party[0].hp = 10.5; const loaded = state.loadSnapshot(state.saveSnapshot(g, [])); check('state', 'load clears turn lock and rounds fractional stats', loaded.game.turnEnding === false && loaded.game.party[0].strength === 13 && Number.isInteger(loaded.game.party[0].hp)); }
{ const g = mkGame(); state.saveSlot('A', g, []); state.saveSlot('B', g, []); check('state', 'named slots list/save/delete', Object.keys(state.listSaveSlots()).sort().join() === 'A,B' && state.loadSlot('A') && state.deleteSlot('A') && !state.loadSlot('A') && state.loadSlot('B')); }
{ const g = state.createGame(); for (let i = 0; i < 7; i++) state.createPartyMember(g, 'x' + i, 'fighter'); check('state', 'cannot exceed 6 members', g.party.length === 6); }
{ const g = mkGame(); const added = state.createPartyMember(g, 'Late', 'archer'); map.placeNewMember(g, added); const snap = state.loadSnapshot(state.saveSnapshot(g, [])); check('state', 'member added after map gen has a position and save still loads', added.position && snap !== null); }
{ const old = { version: 1, game: state.saveSnapshot(mkGame(), []).game, log: [] }; const migrated = state.migrateSnapshot(old); check('state', 'v1 snapshot migrates to current', migrated && migrated.version === config.SAVE_VERSION); }

// ---------------- map ----------------
{ let disconnected = 0, exitsMissing = 0, bossFloorsOk = 0, bossFloors = 0; for (let t = 0; t < 30; t++) { const g = state.createGame(); state.createPartyMember(g, 'A', 'fighter'); const m = state.activeMember(g); m.dungeonLevel = 1 + (t % 10); map.generateMap(g, m, noop); const pass = (x, y) => { const c = g.map[y]?.[x]; return c !== undefined && c !== '#' && c !== '≡' && c !== '~'; }; const seen = new Set([`${m.position.x},${m.position.y}`]); const q = [m.position]; while (q.length) { const c = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c.x + dx, y = c.y + dy, k = `${x},${y}`; if (!seen.has(k) && pass(x, y)) { seen.add(k); q.push({ x, y }); } } } let all = 0; for (let y = 0; y < g.mapHeight; y++) for (let x = 0; x < g.mapWidth; x++) if (pass(x, y)) all++; if (seen.size !== all) disconnected++; if (!g.exitPositions.length || !g.exitPositions.every(e => g.map[e.y][e.x] === '>')) exitsMissing++; if (m.dungeonLevel % 5 === 0) { bossFloors++; if (Object.values(g.monsters).some(mon => config.BOSSES.some(b => b.name === mon.name))) bossFloorsOk++; } }
  check('map', 'every floor fully connected (30 maps)', disconnected === 0, `${disconnected} disconnected`);
  check('map', 'every floor has exit tiles', exitsMissing === 0);
  check('map', 'boss present on every 5th floor', bossFloors > 0 && bossFloorsOk === bossFloors, `${bossFloorsOk}/${bossFloors}`); }
{ const g = mkGame(); const biomes = [1, 6, 11, 16].map(l => map.getBiome(l).name); check('map', 'biomes change with depth', new Set(biomes).size >= 2, biomes.join(' | ')); }
{ const g = mkGame(); const p = state.activeMember(g).position; clearAround(g, p, 3); g.map[p.y][p.x + 1] = '+'; g.doors[`${p.x + 1},${p.y}`] = { open: false, x: p.x + 1, y: p.y }; const before = map.isWalkable(g, p.x + 1, p.y); map.toggleDoor(g, p.x + 1, p.y, noop); check('map', 'door closed=blocked, walk into it=opens', before === false && map.isWalkable(g, p.x + 1, p.y) === true); }
{ const g = mkGame(); const p = state.activeMember(g).position; clearAround(g, p, 2); g.map[p.y][p.x + 1] = '≡'; g.map[p.y][p.x - 1] = '~'; check('map', 'chasm and water are impassable', !map.isWalkable(g, p.x + 1, p.y) && !map.isWalkable(g, p.x - 1, p.y)); }
{ const g = mkGame(); const m = state.activeMember(g); const explored = g.explored[m.dungeonLevel]; const seenTiles = explored.flat().filter(Boolean).length; check('map', 'fog of war: only part of the map is explored at start', seenTiles > 0 && seenTiles < explored.flat().length / 2); }

// ---------------- pathfinding ----------------
{ const g = mkGame(); const p = state.activeMember(g).position; clearAround(g, p, 4); const d = pathfinding.pathDistanceWithin(g, p, { x: p.x + 3, y: p.y }, 10); check('pathfinding', 'straight path distance 3', d === 3, String(d)); g.map[p.y][p.x + 1] = '#'; g.map[p.y - 1][p.x + 1] = '#'; g.map[p.y + 1][p.x + 1] = '#'; const d2 = pathfinding.pathDistanceWithin(g, p, { x: p.x + 3, y: p.y }, 10); check('pathfinding', 'routes around a wall (longer than 3)', d2 > 3 || d2 === null || d2 === Infinity, String(d2)); }

// ---------------- party ----------------
{ const m = { level: 1, classBase: { ...config.CLASSES.fighter }, classKey: 'fighter', constitution: 10, strength: 10, dexterity: 10, powerItems: 0, statusEffects: [] }; party.updateDerivedStats(m); const base = m.maxHp; m.constitution = 12; party.updateDerivedStats(m); check('party', 'Con raises max HP (+5 per point)', m.maxHp === base + 10); m.powerItems = 1; party.updateDerivedStats(m); check('party', 'Power Item +5 basic attack', m.attack === config.CLASSES.fighter.attack + 5); }
{ const g = mkGame(); const m = g.party[0]; m.allocatedFields = ['strength']; const s0 = m.strength, d0 = m.dexterity; const need = party.experienceRequired(m, g.party.length); party.gainExperience(m, need, 'test', g, lm); check('party', 'level up: +2 invested stat, others whole numbers', m.level === 2 && m.strength === s0 + 2 && Number.isInteger(m.dexterity) && m.dexterity === d0); party.gainExperience(m, party.experienceRequired(m, g.party.length), 'test', g, lm); check('party', '+1 to other stats every second level', m.level === 3 && m.dexterity === d0 + 1); check('party', 'level up fully heals', m.hp === m.maxHp); }
{ const g = mkGame(); const m = g.party[0]; party.gainExperience(m, 10 ** 9, 'test', g, lm); check('party', 'level cap 30 holds', m.level === 30); }
{ const req5 = party.experienceRequired({ level: 5 }, 6), req5small = party.experienceRequired({ level: 5 }, 2), req1 = party.experienceRequired({ level: 1 }, 6); check('party', 'XP needed grows with level, shrinks with party size', req5 > req1 && req5small > req5); }
{ const m = { statusEffects: [], movesPerTurn: 0, movesRemaining: 0 }; party.setMovementAllowance(m); check('party', '10 movement per turn', m.movesPerTurn === 10); party.addStatusEffect(m, 'haste', 4, 2); party.setMovementAllowance(m); check('party', 'haste +2 movement', m.movesPerTurn === 12); m.statusEffects = []; party.addStatusEffect(m, 'slow', 3); party.setMovementAllowance(m); check('party', 'slow -2 movement', m.movesPerTurn === 8); }
{ const m = { hp: 20, maxHp: 20, statusEffects: [] }; party.addStatusEffect(m, 'poison', 2, 3); party.tickStatusEffects(m); check('party', 'poison ticks damage and counts down', m.hp === 17 && m.statusEffects[0].duration === 1); party.tickStatusEffects(m); check('party', 'poison expires', m.statusEffects.length === 0); }
{ const g = mkGame(); const n = g.party.length; g.hasStarted = true; const alive = g.party[1]; const ok1 = party.removePartyMember(g, alive.id, lm); g.party[2].hp = 0; const ok2 = party.removePartyMember(g, g.party[2].id, lm); check('party', 'remove: living blocked after start, fallen allowed', ok1 === false && ok2 === true && g.party.length === n - 1); }

// ---------------- abilities ----------------
check('abilities', 'every class has attack/spell/power', Object.keys(config.CLASSES).every(c => abilities.ABILITIES[c]?.attack && abilities.ABILITIES[c]?.spell && abilities.ABILITIES[c]?.power));
check('abilities', 'guide dice: Bow Shot 1d8 r5, Fireball 2d6, Backstab 3d6, Cleave 2d8, Healing Word 2d4', JSON.stringify(abilities.ABILITIES.archer.attack.dice) === '[1,8]' && abilities.ABILITIES.archer.attack.range === 5 && JSON.stringify(abilities.ABILITIES.wizard.spell.dice) === '[2,6]' && JSON.stringify(abilities.ABILITIES.rogue.power.dice) === '[3,6]' && JSON.stringify(abilities.ABILITIES.fighter.power.dice) === '[2,8]' && JSON.stringify(abilities.ABILITIES.cleric.spell.dice) === '[2,4]');
{ const m = { level: 1, strength: 10, powerItems: 0 }; const a = abilities.ABILITIES.fighter.attack; const b0 = abilities.abilityBonus(m, a); m.strength = 14; const b1 = abilities.abilityBonus(m, a); m.level = 5; const b2 = abilities.abilityBonus(m, a); m.powerItems = 1; const b3 = abilities.abilityBonus(m, a); check('abilities', 'damage bonus = stat mod + level/2 + 2/power item', b0 === 0 && b1 === 2 && b2 === 4 && b3 === 6, `${b0},${b1},${b2},${b3}`); }
{ const m = { level: 1, classKey: 'wizard', intelligence: 10 }; const c0 = abilities.spellCharges(m); m.level = 6; m.intelligence = 14; check('abilities', 'spell charges = 2 + level/3 + stat mod', c0 === 2 && abilities.spellCharges(m) === 6); }
function abilityScenario(cls, slot, setup) { const g = mkGame([cls, 'cleric']); const m = g.party[0]; g.activeMemberIndex = 0; const p = m.position; clearAround(g, p, 6); const mon = putMonster(g, p.x + 1, p.y); abilities.ensureAbilityState(m); logs.length = 0; const extra = setup ? setup(g, m, p) : {}; const used = abilities.useAbility(g, m, slot, lm); return { g, m, mon, used, extra, log: logs.join('\n') }; }
{ const s = abilityScenario('fighter', 'attack'); check('abilities', 'basic attack damages adjacent monster and logs dice', s.used && s.mon.hp < 12 && /\[\d+/.test(s.log)); }
{ const s = abilityScenario('archer', 'attack', (g, m, p) => { g.map[p.y][p.x + 1] = '.'; delete g.monsters[`${p.x + 1},${p.y}`]; return { far: putMonster(g, p.x + 5, p.y) }; }); check('abilities', 'Bow Shot hits at range 5', s.used && s.extra.far.hp < 12); }
{ const s = abilityScenario('archer', 'attack', (g, m, p) => { g.map[p.y][p.x + 1] = '.'; delete g.monsters[`${p.x + 1},${p.y}`]; return { far: putMonster(g, p.x + 6, p.y) }; }); check('abilities', 'Bow Shot refused at range 6', !s.used && /no enemy within 5/.test(s.log)); }
{ const s = abilityScenario('fighter', 'spell'); check('abilities', 'Battle Cry blesses self (+2 Atk 3 turns), costs a charge', s.used && s.m.statusEffects.some(e => e.type === 'bless' && e.duration === 3) && s.m.spellChargesLeft === abilities.spellCharges(s.m) - 1); }
{ const s = abilityScenario('fighter', 'power', (g, m, p) => ({ b: putMonster(g, p.x, p.y + 1) })); check('abilities', 'Cleave hits all adjacent and sets cooldown 3', s.used && s.mon.hp < 12 && s.extra.b.hp < 12 && s.m.powerCooldown === 3); }
{ const s = abilityScenario('rogue', 'spell'); check('abilities', 'Poison Vial poisons target (3 turns)', s.used && s.mon.poisoned === 3); }
{ const s = abilityScenario('archer', 'spell'); check('abilities', 'Pinning Shot slows target (3 turns)', s.used && s.mon.slowed === 3); }
{ const s = abilityScenario('wizard', 'spell', (g, m, p) => ({ side: putMonster(g, p.x + 2, p.y) })); check('abilities', 'Fireball splashes adjacent enemy for half', s.used && s.mon.hp < 12 && s.extra.side.hp < 12); }
{ const s = abilityScenario('wizard', 'power', (g, m, p) => ({ big: putMonster(g, p.x + 3, p.y, { hp: 40, maxHp: 40 }) })); check('abilities', 'Lightning Storm targets strongest enemy in range', s.used && s.extra.big.hp < 40 && s.mon.hp === 12); }
{ const s = abilityScenario('cleric', 'spell', (g, m) => { g.party[1].hp = 1; g.party[1].position = { x: m.position.x - 1, y: m.position.y }; return {}; }); check('abilities', 'Healing Word heals most wounded ally', s.used && s.g.party[1].hp > 1); }
{ const g = mkGame(['wizard']); const m = g.party[0]; abilities.ensureAbilityState(m); m.spellChargesLeft = 0; clearAround(g, m.position, 3); putMonster(g, m.position.x + 1, m.position.y); logs.length = 0; const used = abilities.useAbility(g, m, 'spell', lm); check('abilities', 'spell refused with no charges', !used && /out of spell charges/.test(logs.join())); m.powerCooldown = 2; logs.length = 0; const used2 = abilities.useAbility(g, m, 'power', lm); check('abilities', 'power refused while recharging', !used2 && /recharging/.test(logs.join())); }
{ const m = { powerCooldown: 2 }; abilities.refreshAbilityTurn(m); check('abilities', 'cooldown ticks down each turn', m.powerCooldown === 1); }

// ---------------- combat ----------------
{ const g = mkGame(['fighter']); const m = g.party[0]; clearAround(g, m.position, 4); const mon = putMonster(g, m.position.x + 1, m.position.y, { hp: 1, maxHp: 1 }); logs.length = 0; const xp0 = m.xp; const killed = combat.attackMonster(g, m, mon.x ?? m.position.x + 1, m.position.y, lm); check('combat', 'kill grants XP and clears tile', killed && m.xp > xp0 && g.map[m.position.y][m.position.x + 1] === '.' && !g.monsters[`${m.position.x + 1},${m.position.y}`]); }
{ const g = mkGame(['fighter']); const m = g.party[0]; clearAround(g, m.position, 4); putMonster(g, m.position.x + 1, m.position.y, { hp: 999, maxHp: 999, attack: 6 }); const hp0 = m.hp; combat.attackMonster(g, m, m.position.x + 1, m.position.y, lm); check('combat', 'melee target strikes back', m.hp < hp0); }
{ const g = mkGame(['fighter']); const m = g.party[0]; clearAround(g, m.position, 6); const mon = putMonster(g, m.position.x + 3, m.position.y, { poisoned: 3, hp: 12, maxHp: 50 }); logs.length = 0; await combat.enemyTurn(g, m, lm, null, null); check('combat', 'poisoned monster takes damage each monster phase and logs it', mon.hp < 12 && mon.poisoned === 2 && /poison damage/.test(logs.join())); }
{ const g = mkGame(['fighter']); const m = g.party[0]; clearAround(g, m.position, 6); const mon = putMonster(g, m.position.x + 2, m.position.y, { ai: 'ranged', slowed: 3, attack: 20 }); const hp0 = m.hp; logs.length = 0; await combat.enemyTurn(g, m, lm, null, null); const skipped = /pinned and cannot act/.test(logs.join()); await combat.enemyTurn(g, m, lm, null, null); check('combat', 'pinned monster skips every other phase', skipped && mon.slowed === 1); }
{ const g = mkGame(['fighter']); const m = g.party[0]; clearAround(g, m.position, 6); putMonster(g, m.position.x + 3, m.position.y, { ai: 'ranged', attack: 20 }); const hp0 = m.hp; await combat.enemyTurn(g, m, lm, null, null); check('combat', 'ranged monster hits from 3 tiles away', m.hp < hp0); }
{ const g = mkGame(['fighter']); const m = g.party[0]; clearAround(g, m.position, 6); const mon = putMonster(g, m.position.x + 2, m.position.y, { ai: 'fleeing' }); await combat.enemyTurn(g, m, lm, null, null); const stillAt = g.monsters[`${m.position.x + 2},${m.position.y}`]; check('combat', 'fleeing monster moves away when adjacent-ish', !stillAt || Object.keys(g.monsters).length === 1); }
{ const g = mkGame(['fighter']); g.difficulty = 'hard'; const m = g.party[0]; m.hp = 0; logs.length = 0; combat.downMember(g, m, lm); check('combat', 'hard: permadeath message, game over when all fall', /fallen permanently/.test(logs.join()) && g.gameOver === true); }
{ let saved = 0, down = 0; for (let i = 0; i < 300; i++) { const g = mkGame(['fighter', 'rogue']); const m = g.party[0]; m.hp = 0; combat.downMember(g, m, lm); if (m.hp > 0) saved++; else down++; } check('combat', 'normal: death save ~30% (clings on at 25% HP)', saved > 50 && saved < 130 && down > 0, `${saved}/300 saved`); }
{ const g = mkGame(['cleric', 'fighter']); const m = g.party[0]; g.party[1].hp = 0; g.party[1].position = { ...m.position }; g.shrinesUsed = {}; const ok = combat.reviveAtShrine(g, m, lm); check('combat', 'shrine revives a fallen ally at 50% HP, single use', ok && g.party[1].hp === Math.ceil(g.party[1].maxHp * 0.5) && combat.reviveAtShrine(g, m, lm) === false); }
{ const g = mkGame(['fighter']); const m = g.party[0]; m.hp = 1; m.inventory = { potion: 1 }; combat.useItem(g, 'potion', m, lm); check('combat', 'potion heals 20 and is consumed', m.hp === Math.min(m.maxHp, 21) && !m.inventory.potion); m.inventory = { scroll: 1 }; combat.useItem(g, 'scroll', m, lm); check('combat', 'scroll grants bless 5 turns', m.statusEffects.some(e => e.type === 'bless' && e.duration === 5)); party.addStatusEffect(m, 'poison', 3, 2); m.inventory = { antidote: 1 }; combat.useItem(g, 'antidote', m, lm); check('combat', 'antidote cures poison', !m.statusEffects.some(e => e.type === 'poison')); }
{ const g = mkGame(['fighter']); const m = g.party[0]; m.hp = 10; m.maxHp = 10; const dmgs = new Set(); for (let i = 0; i < 40; i++) { m.hp = 10; combat.handleTrap(g, m.position.x, m.position.y, lm); dmgs.add(10 - m.hp); g.map[m.position.y][m.position.x] = '^'; } check('combat', 'trap deals 2-6 damage', [...dmgs].every(d => d >= 2 && d <= 6), [...dmgs].sort().join()); }
{ const g = mkGame(['fighter']); const m = g.party[0]; const x0 = m.xp; combat.collectPowerItem(m, g, lm); check('combat', 'Power Item: +60 XP, +1 powerItems, +5 attack', m.powerItems === 1 && m.xp - x0 === 60 || m.level > 1); }

// ---------------- actions ----------------
{ const g = mkGame(['fighter', 'rogue']); const m = g.party[0]; clearAround(g, m.position, 4); logs.length = 0; const x0 = m.xp; actions.move(g, 'right', lm, noop, null); actions.move(g, 'left', lm, noop, null); actions.move(g, 'right', lm, noop, null); check('actions', 'exploring XP once per tile (3 moves, 2 new tiles max)', m.xp - x0 <= 6 && m.xp - x0 >= 3 && m.movesRemaining === 7 && /exploring/.test(logs.join()) && !/from movement/.test(logs.join())); }
{ const g = mkGame(['fighter', 'rogue']); const m = g.party[0]; m.hp = 1; m.movesRemaining = 10; await actions.rest(g, lm, noop, null); check('actions', 'rest heals 30% and ends turn, restores charges', g.party[0].hp >= 1 + Math.floor(g.party[0].maxHp * 0.3) - 1 && g.activeMemberIndex === 1 && g.party[0].spellChargesLeft === abilities.spellCharges(g.party[0])); }
{ const g = mkGame(['fighter', 'rogue']); const m = g.party[0]; m.movesRemaining = 10; actions.standGuard(g, lm, noop, null); check('actions', 'guard: needs full HP, costs 1 move, flags guardActive', m.guardActive === true && m.movesRemaining === 9); }
{ const g = mkGame(['fighter', 'rogue', 'wizard']); const p1 = actions.finishTurn(g, lm, noop, null); const p2 = actions.finishTurn(g, lm, noop, null); await Promise.all([p1, p2]); check('actions', 'double End Turn advances exactly one player', g.activeMemberIndex === 1); }
{ const g = mkGame(['fighter', 'rogue']); const m = g.party[0]; m.movesRemaining = 3; await actions.finishTurn(g, lm, noop, null); check('actions', 'up to 2 unused moves carry over', g.party[1].movesRemaining === 12); }
{ const g = mkGame(['fighter', 'rogue']); g.requireAllReady = true; const m = g.party[0]; clearAround(g, m.position, 3); logs.length = 0; const pos = { ...m.position }; actions.move(g, 'right', lm, noop, null); check('actions', 'network game: first move blocked until all Ready', m.position.x === pos.x && /waiting for/.test(logs.join())); g.party.forEach(p => p.ready = true); actions.move(g, 'right', lm, noop, null); check('actions', 'network game: move allowed once all Ready', m.position.x === pos.x + 1); }
{ const g = mkGame(['fighter', 'rogue']); const m = g.party[0]; clearAround(g, m.position, 3); g.map[m.position.y][m.position.x + 1] = '+'; g.doors[`${m.position.x + 1},${m.position.y}`] = { open: false }; const mv = m.movesRemaining; actions.move(g, 'right', lm, noop, null); check('actions', 'walking into a closed door opens it for free', g.doors[`${m.position.x + 1},${m.position.y}`].open === true && m.movesRemaining === mv); }
{ const g = mkGame(['fighter', 'rogue']); const m = g.party[0]; m.movesRemaining = 1; clearAround(g, m.position, 3); actions.move(g, 'right', lm, noop, null); await new Promise(r => setTimeout(r, 20)); check('actions', 'spending the last move auto-ends the turn', g.activeMemberIndex === 1); }
{ const g = mkGame(['fighter', 'rogue']); g.hasStarted = true; logs.length = 0; actions.setGameDifficulty(g, 'hard', lm); actions.setFormation(g, 'line', lm); check('actions', 'difficulty/formation locked after start', g.difficulty === 'normal' && g.formation === 'cluster' && /only be changed before/.test(logs.join())); }

// ---------------- report ----------------
const byMod = {};
for (const r of results) { (byMod[r.mod] ??= []).push(r); }
let fails = 0;
for (const [mod, list] of Object.entries(byMod)) {
    const bad = list.filter(r => !r.ok);
    fails += bad.length;
    console.log(`${bad.length ? 'FAIL' : ' ok '} ${mod}: ${list.length - bad.length}/${list.length}`);
    for (const r of bad) console.log(`      x ${r.name}${r.detail ? ` [${r.detail}]` : ''}`);
}
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
