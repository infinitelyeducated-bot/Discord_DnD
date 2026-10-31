import { gameRoll } from './dice.js?v=mvvrqkfn';
import { positionKey } from './utils.js?v=mvvrqkfn';
import { addFloatingText } from './ui.js?v=mvvrqkfn';
import { addStatusEffect, updateDerivedStats } from './party.js?v=mvvrqkfn';

// Each class: basic attack (at-will), spell (costs mana-like "spell charges"),
// and a power attack (once per N turns cooldown). Damage = dice + stat mod + level scaling + item bonuses.

export const ABILITIES = {
    fighter: {
        attack:  { name: 'Sword Strike', dice: [1, 8],  stat: 'strength',  type: 'melee',  range: 1 },
        spell:   { name: 'Battle Cry',   dice: [1, 4],  stat: 'strength',  type: 'buff',   range: 0, cost: 1,
                   description: 'Blesses self (+2 Atk, 3 turns) and deals thunder damage to adjacent enemies.' },
        power:   { name: 'Cleave',       dice: [2, 8],  stat: 'strength',  type: 'melee',  range: 1, cooldown: 3,
                   description: 'Heavy swing hitting every adjacent enemy.' }
    },
    archer: {
        attack:  { name: 'Bow Shot',     dice: [1, 8],  stat: 'dexterity', type: 'ranged', range: 5 },
        spell:   { name: 'Pinning Shot', dice: [1, 6],  stat: 'dexterity', type: 'ranged', range: 5, cost: 1,
                   description: 'Pins the target: slowed for 3 turns.' },
        power:   { name: 'Arrow Volley', dice: [2, 8],  stat: 'dexterity', type: 'ranged', range: 5, cooldown: 3,
                   description: 'Rains arrows on up to 3 enemies in range.' }
    },
    rogue: {
        attack:  { name: 'Dagger Slash', dice: [1, 6],  stat: 'dexterity', type: 'melee',  range: 1 },
        spell:   { name: 'Poison Vial',  dice: [1, 6],  stat: 'dexterity', type: 'ranged', range: 3, cost: 1,
                   description: 'Thrown toxin; poisons the target for 3 turns.' },
        power:   { name: 'Backstab',     dice: [3, 6],  stat: 'dexterity', type: 'melee',  range: 1, cooldown: 3,
                   description: 'Devastating strike; crits on 15+ of the attack die.' }
    },
    wizard: {
        attack:  { name: 'Arcane Bolt',  dice: [1, 10], stat: 'intelligence', type: 'ranged', range: 4 },
        spell:   { name: 'Fireball',     dice: [2, 6],  stat: 'intelligence', type: 'ranged', range: 4, cost: 1,
                   description: 'Explodes on target, splashing adjacent enemies for half.' },
        power:   { name: 'Lightning Storm', dice: [3, 10], stat: 'intelligence', type: 'ranged', range: 5, cooldown: 4,
                   description: 'Strikes the strongest enemy in range with massive damage.' }
    },
    cleric: {
        attack:  { name: 'Mace Blow',    dice: [1, 6],  stat: 'wisdom', type: 'melee',  range: 1 },
        spell:   { name: 'Healing Word', dice: [2, 4],  stat: 'wisdom', type: 'heal',   range: 2, cost: 1,
                   description: 'Heals the most wounded ally in range (or self).' },
        power:   { name: 'Divine Smite', dice: [2, 8],  stat: 'wisdom', type: 'melee',  range: 1, cooldown: 3,
                   description: 'Radiant blast; stuns undead-like foes for 1 turn.' }
    }
};

export function statModifier(member, statKey) {
    return Math.floor(((member[statKey] || 10) - 10) / 2);
}

// Scaling: +1 damage per 2 character levels; power items add +2 each to ability damage.
export function abilityBonus(member, ability) {
    return statModifier(member, ability.stat)
        + Math.floor((member.level - 1) / 2)
        + (member.powerItems || 0) * 2;
}

export function spellCharges(member) {
    // Grows with level and the casting stat.
    const statKey = ABILITIES[member.classKey]?.spell?.stat || 'wisdom';
    return 2 + Math.floor(member.level / 3) + Math.max(0, statModifier(member, statKey));
}

export function ensureAbilityState(member) {
    if (typeof member.spellChargesLeft !== 'number') member.spellChargesLeft = spellCharges(member);
    if (typeof member.powerCooldown !== 'number') member.powerCooldown = 0;
}

export function refreshAbilityTurn(member) {
    ensureAbilityState(member);
    if (member.powerCooldown > 0) member.powerCooldown--;
}

export function restoreCharges(member) {
    member.spellChargesLeft = spellCharges(member);
}

function enemiesInRange(game, member, range) {
    const found = [];
    for (let y = Math.max(0, member.position.y - range); y <= Math.min(game.mapHeight - 1, member.position.y + range); y++) {
        for (let x = Math.max(0, member.position.x - range); x <= Math.min(game.mapWidth - 1, member.position.x + range); x++) {
            if (game.map[y][x] !== 'M') continue;
            const dist = Math.abs(x - member.position.x) + Math.abs(y - member.position.y);
            if (dist > range) continue;
            const monster = game.monsters[positionKey(x, y)];
            if (monster) found.push({ x, y, monster, dist });
        }
    }
    return found.sort((a, b) => a.dist - b.dist);
}

function damageMonster(game, member, target, amount, label, logMessage) {
    target.monster.hp = Math.max(0, target.monster.hp - amount);
    addFloatingText(target.x, target.y, `-${amount}`, '#ef5350');
    if (target.monster.hp <= 0) {
        delete game.monsters[positionKey(target.x, target.y)];
        game.map[target.y][target.x] = '.';
        logMessage(`${member.name}'s ${label} slays the ${target.monster.name}!`, member);
        return true;
    }
    logMessage(`${target.monster.name} has ${target.monster.hp} HP left.`, null, target.monster.name);
    return false;
}

// Returns true if the ability was used (consumes the turn), false if it could not be.
export function useAbility(game, member, slot, logMessage) {
    const kit = ABILITIES[member.classKey];
    if (!kit) return false;
    const ability = kit[slot];
    if (!ability) return false;
    ensureAbilityState(member);

    if (slot === 'spell' && member.spellChargesLeft < (ability.cost || 1)) {
        logMessage(`${member.name} is out of spell charges (${spellCharges(member)} restored on descent or rest).`, member);
        return false;
    }
    if (slot === 'power' && member.powerCooldown > 0) {
        logMessage(`${member.name}'s ${ability.name} is recharging (${member.powerCooldown} turn(s) left).`, member);
        return false;
    }

    const bonus = abilityBonus(member, ability);
    const [count, sides] = ability.dice;

    // Healing
    if (ability.type === 'heal') {
        const allies = game.party.filter(m => m.hp > 0 && m.dungeonLevel === member.dungeonLevel && m.position &&
            Math.abs(m.position.x - member.position.x) + Math.abs(m.position.y - member.position.y) <= ability.range);
        const target = allies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || member;
        const roll = gameRoll(count, sides, bonus, `${member.name} ${ability.name}`);
        const healed = Math.min(target.maxHp - target.hp, roll.total);
        target.hp = Math.min(target.maxHp, target.hp + roll.total);
        member.spellChargesLeft -= ability.cost || 1;
        addFloatingText(target.position.x, target.position.y, `+${healed}`, '#66bb6a');
        logMessage(`${member.name} casts ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] healing ${target === member ? 'themself' : target.name} for ${healed} HP (${target.hp}/${target.maxHp}).`, member);
        return true;
    }

    // Self buff (fighter Battle Cry): bless + small AoE
    if (ability.type === 'buff') {
        const roll = gameRoll(count, sides, bonus, `${member.name} ${ability.name}`);
        addStatusEffect(member, 'bless', 3, 2);
        updateDerivedStats(member);
        member.spellChargesLeft -= ability.cost || 1;
        const adjacent = enemiesInRange(game, member, 1);
        for (const target of adjacent) {
            damageMonster(game, member, target, roll.total, ability.name, logMessage);
        }
        logMessage(`${member.name} roars a ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] — blessed for 3 turns${adjacent.length ? ` and deals ${roll.total} to ${adjacent.length} adjacent enem${adjacent.length > 1 ? 'ies' : 'y'}` : ''}.`, member);
        return true;
    }

    // Damage abilities need a target in range
    const targets = enemiesInRange(game, member, ability.range);
    if (!targets.length) {
        logMessage(`${member.name} has no enemy within ${ability.range} space(s) for ${ability.name}.`, member);
        return false;
    }

    if (slot === 'power' && member.classKey === 'fighter') {
        // Cleave: hit all adjacent
        const roll = gameRoll(count, sides, bonus, `${member.name} ${ability.name}`);
        member.powerCooldown = ability.cooldown;
        const adjacent = targets.filter(t => t.dist <= 1);
        for (const target of adjacent) damageMonster(game, member, target, roll.total, ability.name, logMessage);
        logMessage(`${member.name} uses ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] hitting ${adjacent.length} enem${adjacent.length > 1 ? 'ies' : 'y'} for ${roll.total} each.`, member);
        return true;
    }

    if (slot === 'power' && member.classKey === 'archer') {
        // Arrow Volley: up to 3 enemies in range
        const roll = gameRoll(count, sides, bonus, `${member.name} ${ability.name}`);
        member.powerCooldown = ability.cooldown;
        const struck = targets.slice(0, 3);
        for (const target of struck) damageMonster(game, member, target, roll.total, ability.name, logMessage);
        logMessage(`${member.name} looses an ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] striking ${struck.length} enem${struck.length > 1 ? 'ies' : 'y'} for ${roll.total} each.`, member);
        return true;
    }

    if (slot === 'power' && member.classKey === 'wizard') {
        // Lightning Storm: strongest enemy in range
        const target = targets.sort((a, b) => b.monster.hp - a.monster.hp)[0];
        const roll = gameRoll(count, sides, bonus, `${member.name} ${ability.name}`);
        member.powerCooldown = ability.cooldown;
        damageMonster(game, member, target, roll.total, ability.name, logMessage);
        logMessage(`${member.name} calls ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] on ${target.monster.name} for ${roll.total} damage!`, member);
        return true;
    }

    const target = targets[0];

    if (slot === 'power' && member.classKey === 'rogue') {
        // Backstab: crit chance doubles dice
        const roll = gameRoll(count, sides, bonus, `${member.name} ${ability.name}`);
        const crit = roll.rolls.some(r => r >= 5); // on 3d6, any 5-6 triggers bonus
        const total = crit ? roll.total + Math.floor(roll.total / 2) : roll.total;
        member.powerCooldown = ability.cooldown;
        damageMonster(game, member, target, total, ability.name, logMessage);
        logMessage(`${member.name} ${ability.name}s ${target.monster.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}]${crit ? ' CRITICAL' : ''} for ${total} damage!`, member);
        return true;
    }

    if (slot === 'power' && member.classKey === 'cleric') {
        const roll = gameRoll(count, sides, bonus, `${member.name} ${ability.name}`);
        member.powerCooldown = ability.cooldown;
        damageMonster(game, member, target, roll.total, ability.name, logMessage);
        logMessage(`${member.name} smites ${target.monster.name} with ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] for ${roll.total} radiant damage!`, member);
        return true;
    }

    if (slot === 'spell') {
        const roll = gameRoll(count, sides, bonus, `${member.name} ${ability.name}`);
        member.spellChargesLeft -= ability.cost || 1;
        if (member.classKey === 'wizard') {
            // Fireball: splash half to enemies adjacent to the target
            damageMonster(game, member, target, roll.total, ability.name, logMessage);
            const splash = enemiesInRange(game, member, ability.range).filter(t =>
                t !== target && Math.abs(t.x - target.x) + Math.abs(t.y - target.y) <= 1);
            for (const s of splash) damageMonster(game, member, s, Math.floor(roll.total / 2), `${ability.name} splash`, logMessage);
            logMessage(`${member.name} hurls a ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] at ${target.monster.name} for ${roll.total}${splash.length ? ` (+${Math.floor(roll.total / 2)} splash to ${splash.length})` : ''}.`, member);
        } else if (member.classKey === 'rogue') {
            damageMonster(game, member, target, roll.total, ability.name, logMessage);
            if (target.monster.hp > 0) {
                target.monster.poisoned = 3;
                logMessage(`${target.monster.name} is poisoned!`, null, target.monster.name);
            }
            logMessage(`${member.name} throws a ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] at ${target.monster.name} for ${roll.total} poison damage.`, member);
        } else if (member.classKey === 'archer') {
            damageMonster(game, member, target, roll.total, ability.name, logMessage);
            if (target.monster.hp > 0) {
                target.monster.slowed = 3;
                logMessage(`${target.monster.name} is pinned and slowed!`, null, target.monster.name);
            }
            logMessage(`${member.name} fires a ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] at ${target.monster.name} for ${roll.total} damage.`, member);
        }
        return true;
    }

    // Basic attack
    const roll = gameRoll(count, sides, bonus, `${member.name} ${ability.name}`);
    damageMonster(game, member, target, roll.total, ability.name, logMessage);
    logMessage(`${member.name} uses ${ability.name} [${roll.rolls.join('+')}${bonus ? '+' + bonus : ''}] on ${target.monster.name} for ${roll.total} damage.`, member);
    return true;
}
