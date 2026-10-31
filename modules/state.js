import {
    SAVE_VERSION,
    SAVE_STORAGE_KEY,
    SAVE_SLOTS_KEY,
    MAX_PARTY_SIZE,
    MAX_MAP_WIDTH,
    MAX_MAP_HEIGHT,
    MAP_SIZE_MULTIPLIER,
    LEGACY_MAP_WIDTH,
    LEGACY_MAP_HEIGHT,
    MAX_CHARACTER_LEVEL,
    BASE_MAP_WIDTH,
    BASE_MAP_HEIGHT,
    CLASSES,
    PLAYER_COLORS,
    PLAYER_MARKERS
} from './config.js?v=mvvrqkfn';
import { deepClone, positionKey } from './utils.js?v=mvvrqkfn';

export const MIGRATIONS = {
    1: snapshot => {
        const g = snapshot.game;
        g.items = g.items || {};
        g.doors = g.doors || {};
        g.levers = g.levers || {};
        g.pressurePlates = g.pressurePlates || {};
        g.shrinesUsed = g.shrinesUsed || {};
        g.difficulty = g.difficulty || 'normal';
        g.formation = g.formation || 'cluster';
        for (const member of g.party) {
            member.inventory = member.inventory || {};
            member.statusEffects = member.statusEffects || [];
        }
        return snapshot;
    }
};

export function createGame() {
    return {
        party: [],
        activeMemberIndex: 0,
        map: [],
        monsters: {},
        treasures: {},
        items: {},
        exitPositions: [],
        floorStates: {},
        explored: {},
        doors: {},
        levers: {},
        pressurePlates: {},
        gameOver: false,
        turn: 0,
        nextMemberId: 1,
        hasStarted: false,
        turnEnding: false,
        visitedTiles: {},
        startingPointsPerPlayer: null,
        difficulty: 'normal',
        shrinesUsed: {},
        formation: 'cluster',
        formationOffsets: [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]],
        network: {
            mode: null,
            peerId: null,
            hostId: null,
            connections: [],
            queuedActions: []
        }
    };
}

export function createPartyMember(game, name, classKey) {
    if (game.party.length >= MAX_PARTY_SIZE) return null;
    const baseStats = CLASSES[classKey];
    const classSettings = {
        fighter: { race: 'Human', armorClass: 14 },
        archer: { race: 'Elf', armorClass: 13 },
        rogue: { race: 'Elf', armorClass: 12 },
        wizard: { race: 'Gnome', armorClass: 10 },
        cleric: { race: 'Dwarf', armorClass: 16 }
    }[classKey];

    const base = deepClone(baseStats);
    const newMember = {
        id: game.nextMemberId++,
        color: PLAYER_COLORS[game.party.length % PLAYER_COLORS.length],
        marker: PLAYER_MARKERS[game.party.length % PLAYER_MARKERS.length],
        name,
        className: base.name,
        classKey,
        race: classSettings.race,
        level: 1,
        hp: base.hp,
        maxHp: base.maxHp,
        attack: base.attack,
        defense: base.defense,
        xp: 0,
        treasure: 0,
        treasureCount: 0,
        powerItems: 0,
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        armorClass: classSettings.armorClass,
        initiative: 0,
        classBase: deepClone(baseStats),
        pendingAttributePoints: game.startingPointsPerPlayer || 0,
        dungeonLevel: 1,
        clericHealedLevels: [],
        floorPositions: {},
        position: null,
        guardActive: false,
        movesPerTurn: 0,
        movesRemaining: 0,
        allocatedFields: [],
        inventory: {},
        statusEffects: []
    };
    game.party.push(newMember);
    return newMember;
}

export function activeMember(game) {
    return game.party[game.activeMemberIndex] || null;
}

export function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== SAVE_VERSION || !snapshot.game) return false;
    const g = snapshot.game;
    if (!Array.isArray(g.party) || g.party.length < 1 || g.party.length > MAX_PARTY_SIZE) return false;
    if (!Array.isArray(g.map) || g.map.length < 1 || g.map.length > MAX_MAP_HEIGHT) return false;
    if (!g.map.every(row => Array.isArray(row) && row.length === g.map[0].length && row.length >= 1 && row.length <= MAX_MAP_WIDTH)) return false;
    if (!Number.isInteger(g.activeMemberIndex) || g.activeMemberIndex < 0 || g.activeMemberIndex >= g.party.length) return false;
    if (!g.monsters || typeof g.monsters !== 'object') return false;
    if (!g.floorStates || typeof g.floorStates !== 'object') return false;
    if (!Array.isArray(g.exitPositions)) return false;
    if (!Array.isArray(snapshot.log)) return false;
    return g.party.every(member =>
        member && Number.isInteger(member.id) && typeof member.name === 'string' &&
        Object.hasOwn(CLASSES, member.classKey) && Number.isFinite(member.hp) &&
        Number.isFinite(member.maxHp) && Number.isInteger(member.dungeonLevel) && member.dungeonLevel >= 1 &&
        (member.position === null || (Number.isFinite(member.position.x) && Number.isFinite(member.position.y))) &&
        (member.position !== null || (
            member.floorPositions &&
            member.floorPositions[member.dungeonLevel] &&
            Number.isFinite(member.floorPositions[member.dungeonLevel].x) &&
            Number.isFinite(member.floorPositions[member.dungeonLevel].y)
        ))
    );
}

export function saveSnapshot(game, gameLog) {
    const snapshot = {
        version: SAVE_VERSION,
        game: deepClone(game),
        log: deepClone(gameLog)
    };
    // Strip runtime methods so deepClone is symmetric with loadSnapshot
    if (snapshot.game.activeMember) delete snapshot.game.activeMember;
    return snapshot;
}

export function persistSnapshot(game, gameLog) {
    const snapshot = saveSnapshot(game, gameLog);
    try {
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(snapshot));
        return true;
    } catch (error) {
        console.error('Failed to save snapshot:', error);
        return false;
    }
}

export function migrateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot.version !== 'number') return null;
    let current = snapshot.version;
    while (current < SAVE_VERSION) {
        const migration = MIGRATIONS[current];
        if (!migration) return null;
        snapshot = migration(snapshot);
        current++;
        snapshot.version = current;
    }
    return snapshot;
}

export function loadSnapshot(snapshot) {
    const migrated = migrateSnapshot(snapshot);
    if (!migrated || !validateSnapshot(migrated)) return null;
    const game = deepClone(migrated.game);
    game.turnEnding = false; // never restore a save in the middle of a monster phase
    if (!game.visitedTiles) game.visitedTiles = {};
    // Older saves could carry fractional stats/HP from the +0.5-per-level rule.
    for (const m of game.party || []) {
        for (const k of ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'initiative', 'hp', 'maxHp']) {
            if (typeof m[k] === 'number' && !Number.isInteger(m[k])) m[k] = Math.round(m[k]);
        }
    }
    game.activeMember = () => game.party[game.activeMemberIndex] || null;
    return { game, log: deepClone(migrated.log) };
}

export function loadStoredSnapshot() {
    try {
        const raw = localStorage.getItem(SAVE_STORAGE_KEY);
        if (!raw) return null;
        return loadSnapshot(JSON.parse(raw));
    } catch (error) {
        console.error('Failed to load stored snapshot:', error);
        return null;
    }
}

export function listSaveSlots() {
    try {
        const raw = localStorage.getItem(SAVE_SLOTS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.error('Failed to list save slots:', error);
        return {};
    }
}

export function saveSlot(slotName, game, gameLog) {
    try {
        const slots = listSaveSlots();
        slots[slotName] = saveSnapshot(game, gameLog);
        localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots));
        return true;
    } catch (error) {
        console.error('Failed to save slot:', error);
        return false;
    }
}

export function loadSlot(slotName) {
    try {
        const slots = listSaveSlots();
        const snapshot = slots[slotName];
        if (!snapshot) return null;
        return loadSnapshot(snapshot);
    } catch (error) {
        console.error('Failed to load slot:', error);
        return null;
    }
}

export function deleteSlot(slotName) {
    try {
        const slots = listSaveSlots();
        delete slots[slotName];
        localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(slots));
        return true;
    } catch (error) {
        console.error('Failed to delete slot:', error);
        return false;
    }
}

export function mapDimensionsForLevel(dungeonLevel) {
    const dangerTier = Math.floor((dungeonLevel - 1) / 5);
    const expandDimension = size => {
        const expanded = Math.ceil(size * MAP_SIZE_MULTIPLIER);
        return Math.min(dungeonLevel <= 5 ? LEGACY_MAP_WIDTH : MAX_MAP_WIDTH, expanded);
    };
    const legacyWidth = Math.min(LEGACY_MAP_WIDTH, BASE_MAP_WIDTH + dangerTier * 4);
    const legacyHeight = Math.min(LEGACY_MAP_HEIGHT, BASE_MAP_HEIGHT + dangerTier * 2);
    return {
        width: expandDimension(legacyWidth),
        height: expandDimension(legacyHeight)
    };
}
