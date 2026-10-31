import { describe, it } from 'node:test';
import assert from 'node:assert';
import { rollAttackDamage, killExperience } from '../modules/combat.js';

describe('rollAttackDamage', () => {
    it('returns positive damage for a level 1 fighter', () => {
        const member = {
            classKey: 'fighter',
            level: 1,
            attack: 4,
            strength: 10,
            dexterity: 10,
            initiative: 0,
            movesRemaining: 1
        };
        const result = rollAttackDamage(member, 1);
        assert.ok(result.damage >= 1, 'damage should be at least 1');
        assert.ok(result.criticalRoll >= 1 && result.criticalRoll <= 20, 'critical roll in range');
    });

    it('critical hits double damage', () => {
        const member = {
            classKey: 'wizard',
            level: 1,
            attack: 6,
            intelligence: 20,
            initiative: 0,
            movesRemaining: 1
        };
        const result = rollAttackDamage(member, 1);
        if (result.critical) {
            assert.ok(result.damage >= 12, 'critical should at least double base');
        }
    });
});

describe('killExperience', () => {
    it('scales with dungeon level', () => {
        const low = killExperience({ dungeonLevel: 1, wisdom: 10 }, { party: [] });
        const high = killExperience({ dungeonLevel: 20, wisdom: 20 }, { party: [] });
        assert.ok(low > 0, 'low level xp is positive');
        assert.ok(high >= low, 'high level xp is not less than low');
    });
});
