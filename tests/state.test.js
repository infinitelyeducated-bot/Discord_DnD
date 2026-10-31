import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SAVE_VERSION, SAVE_STORAGE_KEY } from '../modules/config.js';
import { createGame, createPartyMember, validateSnapshot, migrateSnapshot, saveSnapshot, loadSnapshot } from '../modules/state.js';

function minimalValidGame() {
    const game = createGame();
    createPartyMember(game, 'Test', 'fighter');
    game.mapWidth = 2;
    game.mapHeight = 2;
    game.map = [['#', '#'], ['#', '.']];
    game.explored = { 1: [[false, false], [false, true]] };
    game.floorStates = {};
    game.party[0].position = { x: 1, y: 1 };
    return game;
}

describe('state migration', () => {
    it('migrates v1 snapshots to current version', () => {
        const game = minimalValidGame();
        const snapshot = { version: 1, game, log: [] };
        const migrated = migrateSnapshot(snapshot);
        assert.equal(migrated.version, SAVE_VERSION);
        assert.ok(migrated.game.items, 'items field added');
        assert.ok(migrated.game.party[0].inventory, 'inventory field added');
        assert.ok(Array.isArray(migrated.game.party[0].statusEffects), 'statusEffects field added');
    });

    it('validates a migrated snapshot', () => {
        const game = minimalValidGame();
        const snapshot = { version: 1, game, log: [] };
        const loaded = loadSnapshot(snapshot);
        assert.ok(loaded, 'loaded successfully');
        assert.equal(loaded.game.party[0].name, 'Test');
    });
});

describe('saveSnapshot', () => {
    it('produces a deep clone', () => {
        const game = minimalValidGame();
        const snapshot = saveSnapshot(game, ['log']);
        snapshot.game.party[0].name = 'Mutated';
        assert.equal(game.party[0].name, 'Test');
    });
});
