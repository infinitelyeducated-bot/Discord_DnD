import {
    BASE_MAP_WIDTH,
    BASE_MAP_HEIGHT,
    LEGACY_MAP_WIDTH,
    LEGACY_MAP_HEIGHT,
    MAP_SIZE_MULTIPLIER,
    MAX_MAP_WIDTH,
    MAX_MAP_HEIGHT,
    POWER_ITEM_DROP_CHANCE,
    BIOMES,
    BOSSES,
    ITEMS
} from './config.js?v=mvvrqkfn';
import { positionKey, shuffle, deepClone } from './utils.js?v=mvvrqkfn';
import { activeMember } from './state.js?v=mvvrqkfn';
import { setMovementAllowance, getDifficultySettings } from './party.js?v=mvvrqkfn';

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

export function getBiome(dungeonLevel) {
    return BIOMES[(dungeonLevel - 1) % BIOMES.length];
}

export function generateMap(game, member = activeMember(game), logMessage = () => {}) {
    if (!member) return;
    const dimensions = mapDimensionsForLevel(member.dungeonLevel);
    game.mapWidth = dimensions.width;
    game.mapHeight = dimensions.height;
    game.turn = member.dungeonLevel - 1;
    game.map = Array.from({ length: game.mapHeight }, () => Array(game.mapWidth).fill('#'));
    game.monsters = {};
    game.treasures = {};
    game.exitPositions = [];
    game.doors = {};
    game.levers = {};
    game.pressurePlates = {};
    game.items = {};
    game.shrinesUsed = game.shrinesUsed || {};
    game.biome = getBiome(member.dungeonLevel);
    game.explored = game.explored || {};
    game.explored[member.dungeonLevel] = game.explored[member.dungeonLevel] || Array(game.mapHeight).fill(null).map(() => Array(game.mapWidth).fill(false));

    const rooms = generateRooms(game);
    connectRooms(game, rooms);
    carveSpawnRoom(game, rooms);

    for (const other of game.party) {
        if (other.dungeonLevel === member.dungeonLevel) {
            other.position = other.floorPositions[member.dungeonLevel]
                ? { ...other.floorPositions[member.dungeonLevel] }
                : null;
        } else {
            other.position = null;
        }
    }

    member.position = member.floorPositions[member.dungeonLevel]
        ? { ...member.floorPositions[member.dungeonLevel] }
        : findSpawnInFirstRoom(game, rooms);

    spawnParty(game, member, rooms);
    placeInteractiveTerrain(game, member, rooms);
    if (member.dungeonLevel % 5 === 0) {
        placeBoss(game, member, rooms);
    }
    placeExits(game, rooms);
    placeShrines(game, member, rooms);
    placeItems(game, member);
    placeInteractables(game, member);
    markStart(game, rooms);
    setMovementAllowance(member);
    updateExplored(game, member);
    storeActiveFloor(game, member);
}

function generateRooms(game) {
    const rooms = [];
    const minRoomSize = 4;
    const maxRoomSize = 8;
    const maxAttempts = game.mapWidth * game.mapHeight;
    for (let attempt = 0; attempt < maxAttempts && rooms.length < 12; attempt++) {
        const width = minRoomSize + Math.floor(Math.random() * (maxRoomSize - minRoomSize + 1));
        const height = minRoomSize + Math.floor(Math.random() * (maxRoomSize - minRoomSize + 1));
        const x = 2 + Math.floor(Math.random() * (game.mapWidth - width - 3));
        const y = 2 + Math.floor(Math.random() * (game.mapHeight - height - 3));
        const newRoom = { x, y, width, height, center: { x: Math.floor(x + width / 2), y: Math.floor(y + height / 2) } };

        const overlaps = rooms.some(room =>
            newRoom.x <= room.x + room.width &&
            newRoom.x + newRoom.width >= room.x &&
            newRoom.y <= room.y + room.height &&
            newRoom.y + newRoom.height >= room.y
        );
        if (!overlaps) {
            rooms.push(newRoom);
            for (let ry = newRoom.y; ry < newRoom.y + newRoom.height; ry++) {
                for (let rx = newRoom.x; rx < newRoom.x + newRoom.width; rx++) {
                    game.map[ry][rx] = '.';
                }
            }
        }
    }
    return rooms;
}

function connectRooms(game, rooms) {
    for (let i = 0; i < rooms.length - 1; i++) {
        const a = rooms[i].center;
        const b = rooms[i + 1].center;
        if (Math.random() < 0.5) {
            carveHorizontalCorridor(game, a.x, b.x, a.y);
            carveVerticalCorridor(game, a.y, b.y, b.x);
        } else {
            carveVerticalCorridor(game, a.y, b.y, a.x);
            carveHorizontalCorridor(game, a.x, b.x, b.y);
        }
    }
}

function carveHorizontalCorridor(game, x1, x2, y) {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);
    for (let x = start; x <= end; x++) {
        if (y > 0 && y < game.mapHeight - 1 && x > 0 && x < game.mapWidth - 1) {
            game.map[y][x] = '.';
        }
    }
}

function carveVerticalCorridor(game, y1, y2, x) {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);
    for (let y = start; y <= end; y++) {
        if (y > 0 && y < game.mapHeight - 1 && x > 0 && x < game.mapWidth - 1) {
            game.map[y][x] = '.';
        }
    }
}

function carveSpawnRoom(game, rooms) {
    const spawnRoom = rooms[0] || { x: 1, y: 1, width: 4, height: 4 };
    for (let y = spawnRoom.y; y < spawnRoom.y + spawnRoom.height; y++) {
        for (let x = spawnRoom.x; x < spawnRoom.x + spawnRoom.width; x++) {
            if (y > 0 && y < game.mapHeight - 1 && x > 0 && x < game.mapWidth - 1) {
                game.map[y][x] = '.';
            }
        }
    }
}

function findSpawnInFirstRoom(game, rooms) {
    const room = rooms[0];
    if (room) return { x: room.center.x, y: room.center.y };
    return { x: 1, y: 1 };
}

// Place a member who has no position yet (e.g. added with "+ Add Player" after
// the floor was generated) on a free floor tile next to the party.
export function placeNewMember(game, newMember) {
    if (!newMember || newMember.position) return;
    const anchor = activeMember(game)?.position
        || game.party.find(m => m !== newMember && m.position)?.position;
    newMember.dungeonLevel = activeMember(game)?.dungeonLevel || 1;
    if (!anchor) return;
    const occupied = tile => game.party.some(o => o !== newMember && o.position?.x === tile.x && o.position?.y === tile.y);
    for (let radius = 1; radius <= 8; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const tile = { x: anchor.x + dx, y: anchor.y + dy };
                if (game.map[tile.y]?.[tile.x] === '.' && !occupied(tile)) {
                    newMember.position = tile;
                    newMember.floorPositions = newMember.floorPositions || {};
                    newMember.floorPositions[newMember.dungeonLevel] = { ...tile };
                    updateExplored(game, newMember);
                    return;
                }
            }
        }
    }
    newMember.position = { ...anchor };
    newMember.floorPositions = newMember.floorPositions || {};
    newMember.floorPositions[newMember.dungeonLevel] = { ...anchor };
}

function spawnParty(game, member, rooms) {
    const spawnRoom = rooms[0];
    const spawnTiles = [];
    if (spawnRoom) {
        for (let y = spawnRoom.y; y < spawnRoom.y + spawnRoom.height; y++) {
            for (let x = spawnRoom.x; x < spawnRoom.x + spawnRoom.width; x++) {
                spawnTiles.push({ x, y });
            }
        }
    } else {
        for (let y = 1; y <= 4; y++) {
            for (let x = 1; x <= 4; x++) spawnTiles.push({ x, y });
        }
    }

    for (const partyMember of game.party) {
        if (partyMember.dungeonLevel !== member.dungeonLevel || partyMember.position) continue;
        const spawn = spawnTiles.find(tile =>
            game.map[tile.y]?.[tile.x] === '.' &&
            !game.party.some(other =>
                other !== partyMember && other.dungeonLevel === member.dungeonLevel &&
                other.position?.x === tile.x && other.position?.y === tile.y
            )
        );
        partyMember.position = spawn ? { ...spawn } : { ...member.position };
    }
}

function placeBoss(game, member, rooms) {
    const openTiles = [];
    const spawnRoom = rooms[0];
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] === '.' && (!spawnRoom ||
                x < spawnRoom.x - 3 || x > spawnRoom.x + spawnRoom.width + 2 ||
                y < spawnRoom.y - 3 || y > spawnRoom.y + spawnRoom.height + 2)) {
                openTiles.push({ x, y });
            }
        }
    }
    shuffle(openTiles);
    if (!openTiles.length) return;
    const { x, y } = openTiles[0];
    const bossIndex = ((member.dungeonLevel / 5 - 1) | 0) % BOSSES.length;
    const template = BOSSES[bossIndex];
    const hp = Math.floor(template.hp * getDifficultySettings(game).monsterHpMod);
    game.map[y][x] = 'M';
    game.monsters[positionKey(x, y)] = {
        name: template.name,
        icon: template.icon,
        hp,
        maxHp: hp,
        attack: Math.floor(template.attack * getDifficultySettings(game).monsterAttackMod),
        ai: 'brute',
        isBoss: true
    };
}

function placeShrines(game, member, rooms) {
    const openTiles = [];
    const spawnRoom = rooms[0];
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] === '.' && (!spawnRoom ||
                x < spawnRoom.x - 2 || x > spawnRoom.x + spawnRoom.width + 1 ||
                y < spawnRoom.y - 2 || y > spawnRoom.y + spawnRoom.height + 1)) {
                openTiles.push({ x, y });
            }
        }
    }
    shuffle(openTiles);
    const count = member.dungeonLevel % 5 === 0 ? 0 : 1;
    for (let i = 0; i < count && i < openTiles.length; i++) {
        const { x, y } = openTiles[i];
        game.map[y][x] = 'Θ';
    }
}

function placeItems(game, member) {
    const openTiles = [];
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] === '.') openTiles.push({ x, y });
        }
    }
    shuffle(openTiles);
    const count = 2 + Math.floor(member.dungeonLevel / 3);
    const keys = Object.keys(ITEMS);
    for (let i = 0; i < count && i < openTiles.length; i++) {
        const { x, y } = openTiles[i];
        const key = keys[Math.floor(Math.random() * keys.length)];
        game.items[positionKey(x, y)] = { ...ITEMS[key], key };
    }
}

function placeInteractiveTerrain(game, member, rooms) {
    const openTiles = [];
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] === '.') openTiles.push({ x, y });
        }
    }
    shuffle(openTiles);

    const roomCount = rooms.length;
    const doorCount = Math.min(roomCount, Math.floor(openTiles.length / 20));
    const chasmCount = Math.min(3, Math.floor(openTiles.length / 40));
    const waterCount = Math.min(4, Math.floor(openTiles.length / 30));

    let tileIndex = 0;
    for (let i = 0; i < doorCount && tileIndex < openTiles.length; i++) {
        const { x, y } = openTiles[tileIndex++];
        game.map[y][x] = '+';
        game.doors[positionKey(x, y)] = { open: false, x, y };
    }
    // Chasms and water block movement. Only place them where every floor tile
    // stays reachable, so a 1-wide corridor can never be cut off (that used to
    // strand stairs and monsters behind impassable terrain).
    let placedChasms = 0;
    let placedWater = 0;
    while ((placedChasms < chasmCount || placedWater < waterCount) && tileIndex < openTiles.length) {
        const { x, y } = openTiles[tileIndex++];
        if (game.map[y][x] !== '.') continue;
        const char = placedChasms < chasmCount ? '≡' : '~';
        game.map[y][x] = char;
        if (floorStaysConnected(game)) {
            if (char === '≡') placedChasms++; else placedWater++;
        } else {
            game.map[y][x] = '.';
        }
    }
}

// True when every passable tile can still be reached from any other passable tile.
function floorStaysConnected(game) {
    const passable = (x, y) => {
        const c = game.map[y]?.[x];
        return c !== undefined && c !== '#' && c !== '▓' && c !== '≡' && c !== '~';
    };
    let start = null;
    let total = 0;
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (passable(x, y)) {
                total++;
                if (!start) start = { x, y };
            }
        }
    }
    if (!start) return true;
    const seen = new Set([positionKey(start.x, start.y)]);
    const queue = [start];
    while (queue.length) {
        const cur = queue.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cur.x + dx, ny = cur.y + dy;
            const key = positionKey(nx, ny);
            if (seen.has(key) || !passable(nx, ny)) continue;
            seen.add(key);
            queue.push({ x: nx, y: ny });
        }
    }
    return seen.size === total;
}

function placeExits(game, rooms) {
    const openTiles = [];
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] === '.') openTiles.push({ x, y });
        }
    }
    const spawnRoom = rooms[0];
    const farTiles = openTiles.filter(p =>
        !spawnRoom ||
        p.x < spawnRoom.x - 2 || p.x > spawnRoom.x + spawnRoom.width + 1 ||
        p.y < spawnRoom.y - 2 || p.y > spawnRoom.y + spawnRoom.height + 1
    );
    const candidates = farTiles.length ? farTiles : openTiles;
    shuffle(candidates);
    game.exitPositions = candidates.slice(0, 2);
    for (const exit of game.exitPositions) game.map[exit.y][exit.x] = '>';
}

function placeInteractables(game, member) {
    const spawnRoom = game.map;
    const openTiles = [];
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            const key = positionKey(x, y);
            if (game.map[y][x] === '.' && Math.abs(x - 1) + Math.abs(y - 1) > 5) {
                openTiles.push({ x, y });
            }
        }
    }
    shuffle(openTiles);

    const diff = getDifficultySettings(game);
    const dangerTier = Math.floor((member.dungeonLevel - 1) / 5);
    const livingPartySize = Math.max(1, game.party.filter(p => p.hp > 0).length);
    const interactionScale = (1 + dangerTier * 0.5) * diff.enemyDensity;
    const baseMonsterCount = Math.ceil(livingPartySize * 0.75 * interactionScale);
    const baseTrapCount = Math.ceil(livingPartySize * 0.4 * interactionScale * diff.trapDensity);
    const baseTreasureCount = Math.ceil(livingPartySize * 0.55 * interactionScale);
    const extraInteractables = Math.ceil((baseMonsterCount + baseTrapCount + baseTreasureCount) * 0.2);
    const bonusCounts = [0, 0, 0];
    for (let i = 0; i < extraInteractables; i++) bonusCounts[i % 3]++;

    let tileIndex = 0;
    for (let i = 0; i < baseMonsterCount + bonusCounts[0] && tileIndex < openTiles.length; i++) {
        const { x, y } = openTiles[tileIndex++];
        game.map[y][x] = 'M';
        game.monsters[positionKey(x, y)] = createMonster(game);
    }
    for (let i = 0; i < baseTrapCount + bonusCounts[1] && tileIndex < openTiles.length; i++) {
        const { x, y } = openTiles[tileIndex++];
        game.map[y][x] = '^';
    }
    for (let i = 0; i < baseTreasureCount + bonusCounts[2] && tileIndex < openTiles.length; i++) {
        const { x, y } = openTiles[tileIndex++];
        const treasure = createTreasure(member);
        game.map[y][x] = treasure.icon;
        game.treasures[positionKey(x, y)] = treasure;
    }
}

function markStart(game, rooms) {
    const spawnRoom = rooms[0];
    if (spawnRoom) {
        game.map[spawnRoom.center.y][spawnRoom.center.x] = 'S';
    } else {
        game.map[1][1] = 'S';
    }
}

export function createMonster(game) {
    const member = activeMember(game);
    const dungeonLevel = member?.dungeonLevel || 1;
    const diff = getDifficultySettings(game);
    const scaleLevel = Math.min(MAX_ENEMY_SCALE_LEVEL, Math.floor((dungeonLevel - 1) / 3));
    const unlockedEnemies = Math.min(ENEMIES.length, 1 + scaleLevel);
    const template = ENEMIES[Math.floor(Math.random() * unlockedEnemies)];
    const attackBonus = Math.min(MAX_ENEMY_ATTACK_BONUS, Math.floor(scaleLevel / 3));
    const [minHp, maxHp] = dungeonLevel <= 5 ? [4, 8] : dungeonLevel <= 12 ? [8, 16] : [16, 30];
    const rawHp = minHp + Math.floor(Math.random() * (maxHp - minHp + 1));
    const hp = Math.floor(rawHp * diff.monsterHpMod);
    return {
        name: template.name,
        icon: template.icon,
        hp,
        maxHp: hp,
        attack: Math.floor((template.attack + attackBonus) * diff.monsterAttackMod),
        ai: template.ai || 'brute'
    };
}

export function createTreasure(member) {
    if (Math.random() < POWER_ITEM_DROP_CHANCE) {
        return { type: 'power', name: 'Power Item', icon: 'P', value: 0 };
    }
    const treasures = [
        { name: 'Coin Pouch', icon: '$' },
        { name: 'Gemstone', icon: '%' },
        { name: 'Relic', icon: '&' }
    ];
    const treasure = treasures[Math.floor(Math.random() * treasures.length)];
    const minValue = member.dungeonLevel > 15 ? 12 : 1;
    const maxValue = member.dungeonLevel > 15 ? 50 : 25;
    return { type: 'treasure', ...treasure, value: minValue + Math.floor(Math.random() * (maxValue - minValue + 1)) };
}

export function updateExplored(game, member) {
    if (!member?.position) return;
    const sightRadius = 5;
    const explored = game.explored[member.dungeonLevel];
    for (let y = Math.max(0, member.position.y - sightRadius); y <= Math.min(game.mapHeight - 1, member.position.y + sightRadius); y++) {
        for (let x = Math.max(0, member.position.x - sightRadius); x <= Math.min(game.mapWidth - 1, member.position.x + sightRadius); x++) {
            if (Math.abs(x - member.position.x) + Math.abs(y - member.position.y) <= sightRadius) {
                explored[y][x] = true;
            }
        }
    }
}

export function isWalkable(game, x, y) {
    if (y < 0 || y >= game.mapHeight || x < 0 || x >= game.mapWidth) return false;
    const cell = game.map[y][x];
    if (cell === '#') return false;
    if (cell === '+') {
        const door = game.doors?.[positionKey(x, y)];
        return door?.open ?? false;
    }
    if (cell === '≡') return false;
    if (cell === 'M') return false;
    return true;
}

export function isShrineAt(game, x, y) {
    return game.map[y]?.[x] === 'Θ';
}

export function getItemAt(game, x, y) {
    return game.items?.[positionKey(x, y)] || null;
}

export function removeItemAt(game, x, y) {
    delete game.items?.[positionKey(x, y)];
}

export function toggleDoor(game, x, y, logMessage) {
    const key = positionKey(x, y);
    const door = game.doors?.[key];
    if (!door) return false;
    door.open = !door.open;
    game.map[y][x] = door.open ? '.' : '+';
    logMessage(`${door.open ? 'opens' : 'closes'} a door.`, activeMember(game));
    return true;
}

export function storeActiveFloor(game, member) {
    if (!member || !game.map.length || !member.position) return;
    game.floorStates[member.dungeonLevel] = {
        map: game.map.map(row => [...row]),
        monsters: deepClone(game.monsters),
        treasures: deepClone(game.treasures || {}),
        items: deepClone(game.items || {}),
        exitPositions: game.exitPositions.map(p => ({ ...p })),
        doors: deepClone(game.doors || {}),
        shrinesUsed: deepClone(game.shrinesUsed || {}),
        explored: deepClone(game.explored?.[member.dungeonLevel] || [])
    };
    for (const partyMember of game.party) {
        if (partyMember.dungeonLevel === member.dungeonLevel && partyMember.position) {
            partyMember.floorPositions[member.dungeonLevel] = { ...partyMember.position };
        }
    }
}

export function loadMemberFloor(game, member) {
    const floor = game.floorStates[member.dungeonLevel];
    if (!floor) {
        generateMap(game, member);
        return;
    }
    game.mapWidth = floor.map[0].length;
    game.mapHeight = floor.map.length;
    game.map = floor.map.map(row => [...row]);
    game.monsters = deepClone(floor.monsters);
    game.treasures = deepClone(floor.treasures || {});
    game.items = deepClone(floor.items || {});
    game.exitPositions = floor.exitPositions.map(p => ({ ...p }));
    game.doors = deepClone(floor.doors || {});
    game.shrinesUsed = deepClone(floor.shrinesUsed || {});
    game.explored = game.explored || {};
    game.explored[member.dungeonLevel] = deepClone(floor.explored || []);
    game.biome = getBiome(member.dungeonLevel);
    for (const partyMember of game.party) {
        if (partyMember.dungeonLevel !== member.dungeonLevel) {
            partyMember.position = null;
            continue;
        }
        partyMember.position = partyMember.floorPositions[partyMember.dungeonLevel]
            ? { ...partyMember.floorPositions[partyMember.dungeonLevel] }
            : null;
    }
    if (!member.position) member.position = { x: 1, y: 1 };
    game.turn = member.dungeonLevel - 1;
    updateExplored(game, member);
    storeActiveFloor(game, member);
}

export function setPartyFormation(game, formationName) {
    const formations = {
        cluster: [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]],
        line: [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [3, 0]],
        wedge: [[0, 0], [0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
        spread: [[0, 0], [2, 0], [0, 2], [-2, 0], [0, -2], [2, 2]]
    };
    game.formation = formationName || 'cluster';
    game.formationOffsets = formations[game.formation] || formations.cluster;
}

import { ENEMIES, MAX_ENEMY_SCALE_LEVEL, MAX_ENEMY_ATTACK_BONUS } from './config.js?v=mvvrqkfn';
