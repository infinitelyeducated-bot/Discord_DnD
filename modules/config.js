export const MAP_WIDTH = 21;
export const MAP_HEIGHT = 15;
export const MAX_PARTY_SIZE = 6;
export const SAVE_STORAGE_KEY = 'ascii-dungeon-crawler.snapshot.v2';
export const SAVE_SLOTS_KEY = 'ascii-dungeon-crawler.slots.v1';
export const LAYOUT_STORAGE_KEY = 'ascii-dungeon-crawler.layout.v5';
export const SAVE_VERSION = 2;
export const MAX_CHARACTER_LEVEL = 30;
export const MAX_ENEMY_SCALE_LEVEL = 18;
export const MAX_ENEMY_ATTACK_BONUS = 6;
export const POWER_ITEM_DROP_CHANCE = 1 / 12;
export const BASE_MAP_WIDTH = 49;
export const BASE_MAP_HEIGHT = 35;
export const LEGACY_MAP_WIDTH = 61;
export const LEGACY_MAP_HEIGHT = 35;
export const MAP_SIZE_MULTIPLIER = 2.3;
export const MAX_MAP_WIDTH = 141;
export const MAX_MAP_HEIGHT = 81;
export const SIGNALING_SERVER_URL = typeof location !== 'undefined' ? `ws://${location.hostname}:8080` : 'ws://localhost:8080';

export const PLAYER_COLORS = [
    '#ff4d4d', '#00bfff', '#00e676', '#ffd600',
    '#e040fb', '#ff9100'
];

export const PLAYER_MARKERS = ['@', '1', '2', '3', '4', '5'];

export const CLASSES = {
    fighter: { name: "Fighter", hp: 15, maxHp: 15, attack: 4, defense: 3, xp: 0, level: 1 },
    archer:  { name: "Archer",  hp: 13, maxHp: 13, attack: 5, defense: 2, xp: 0, level: 1 },
    rogue:   { name: "Rogue",   hp: 12, maxHp: 12, attack: 5, defense: 2, xp: 0, level: 1 },
    wizard:  { name: "Wizard",  hp: 10, maxHp: 10, attack: 6, defense: 1, xp: 0, level: 1 },
    cleric:  { name: "Cleric",  hp: 14, maxHp: 14, attack: 3, defense: 4, xp: 0, level: 1 }
};

export const CLASS_SETTINGS = {
    fighter: { race: 'Human', armorClass: 14 },
    archer:  { race: 'Elf',   armorClass: 13 },
    rogue:   { race: 'Elf',   armorClass: 12 },
    wizard:  { race: 'Gnome', armorClass: 10 },
    cleric:  { race: 'Dwarf', armorClass: 16 }
};

export const ENEMIES = [
    { name: "Giant Rat",   icon: "🐀", hp: 8,  attack: 2, ai: 'pack' },
    { name: "Skeleton",    icon: "💀", hp: 10, attack: 3, ai: 'patrol' },
    { name: "Orc",         icon: "👹", hp: 12, attack: 4, ai: 'brute' },
    { name: "Goblin",      icon: "👺", hp: 9,  attack: 3, ai: 'fleeing' },
    { name: "Viper",       icon: "🐍", hp: 7,  attack: 5, ai: 'ranged' },
    { name: "Dark Knight", icon: "💀", hp: 18, attack: 5, ai: 'brute' },
    { name: "Manticore",   icon: "🐉", hp: 20, attack: 6, ai: 'ranged' },
    { name: "Dragon",      icon: "🐉", hp: 30, attack: 8, ai: 'brute' }
];

export const BOSSES = [
    { name: "Bone Tyrant",     icon: "☠",  hp: 80,  attack: 10 },
    { name: "Molten Colossus", icon: "🔥", hp: 120, attack: 12 },
    { name: "Frost Lich",      icon: "❄", hp: 100, attack: 14 },
    { name: "Swarm Queen",     icon: "🕷",  hp: 90,  attack: 11 },
    { name: "Shadow Dragon",   icon: "🐲", hp: 150, attack: 16 }
];

export const ITEMS = {
    potion: { name: "Healing Potion", icon: "🧪", effect: 'heal', value: 20, description: "Restores 20 HP." },
    scroll: { name: "Scroll of Blessing", icon: "📜", effect: 'bless', duration: 5, description: "Grants Bless for 5 turns." },
    haste: { name: "Potion of Haste", icon: "⚡", effect: 'haste', duration: 4, description: "Grants Haste for 4 turns." },
    antidote: { name: "Antidote", icon: "🍃", effect: 'cure', description: "Removes Poison." },
    key: { name: "Iron Key", icon: "🗝", effect: 'key', description: "Opens a locked door." }
};

export const DIFFICULTIES = {
    easy: { label: "Easy", enemyDensity: 0.6, trapDensity: 0.6, xpRate: 1.25, permadeath: false, monsterHpMod: 0.8, monsterAttackMod: 0.8 },
    normal: { label: "Normal", enemyDensity: 1.0, trapDensity: 1.0, xpRate: 1.0, permadeath: false, monsterHpMod: 1.0, monsterAttackMod: 1.0 },
    hard: { label: "Hard", enemyDensity: 1.4, trapDensity: 1.2, xpRate: 0.85, permadeath: true, monsterHpMod: 1.2, monsterAttackMod: 1.2 },
    nightmare: { label: "Nightmare", enemyDensity: 1.8, trapDensity: 1.5, xpRate: 0.7, permadeath: true, monsterHpMod: 1.5, monsterAttackMod: 1.5 }
};

export const BIOMES = [
    {
        name: 'Forgotten Sewers',
        wallChar: '#',
        floorChar: '.',
        wallColor: '#5a5a5a',
        floorColor: '#3a4a3a',
        fogColor: '#1a221a'
    },
    {
        name: 'Crypt of Shadows',
        wallChar: '▓',
        floorChar: '·',
        wallColor: '#4a4a5a',
        floorColor: '#2a2a3a',
        fogColor: '#15151e'
    },
    {
        name: 'Molten Forge',
        wallChar: '▒',
        floorChar: ':',
        wallColor: '#5a2a1a',
        floorColor: '#4a1a1a',
        fogColor: '#1e0a0a'
    },
    {
        name: 'Frozen Ruins',
        wallChar: '░',
        floorChar: ',',
        wallColor: '#4a5a6a',
        floorColor: '#2a3a4a',
        fogColor: '#0a151e'
    },
    {
        name: 'Overgrown Cavern',
        wallChar: '▓',
        floorChar: '"',
        wallColor: '#2a4a2a',
        floorColor: '#1a3a1a',
        fogColor: '#0a1a0a'
    }
];

export const DEFAULT_LAYOUT_SETTINGS = {
    'dungeon-map': { x: 0, y: 0 },
    'map-legend': { x: 0, y: 0 },
    'level-title': { x: 0, y: 0 },
    'game-help': { x: 0, y: 0 },
    'game-log': { x: 0, y: 0 },
    'game-brand': { x: 0, y: 0 },
    'action-legend': { x: 0, y: 0 },
    'character-sheets': { x: 0, y: 0 },
    'party-setup': { x: 0, y: 0 }
};
