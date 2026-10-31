import { CLASSES, CLASS_SETTINGS, MAX_PARTY_SIZE, MAX_CHARACTER_LEVEL, DIFFICULTIES } from './config.js?v=mvvrqkfn';
import { activeMember } from './state.js?v=mvvrqkfn';

export function movementAllowance(member) {
    return 10;
}

export function setMovementAllowance(member) {
    let base = movementAllowance(member);
    const haste = member.statusEffects?.find(e => e.type === 'haste');
    const slow = member.statusEffects?.find(e => e.type === 'slow');
    if (haste) base += 2;
    if (slow) base = Math.max(1, base - 2);
    member.movesPerTurn = base;
    member.movesRemaining = member.movesPerTurn;
}

export function updateDerivedStats(member) {
    const levelBonus = member.level - 1;
    member.maxHp = Math.round(member.classBase.maxHp + levelBonus * 5 + Math.max(0, member.constitution - 10) * 5);
    member.attack = member.classBase.attack + levelBonus +
        (member.classKey === 'fighter' ? Math.floor(Math.max(0, member.strength - 10) / 5) : 0) +
        (member.powerItems || 0) * 5;
    member.defense = member.classBase.defense + levelBonus + Math.floor(Math.max(0, member.dexterity - 10) / 4);
    const bless = member.statusEffects?.find(e => e.type === 'bless');
    const poison = member.statusEffects?.find(e => e.type === 'poison');
    if (bless) member.attack += bless.magnitude || 2;
    if (poison) member.attack = Math.max(1, member.attack - 1);
}

export function applyCharacterClass(member, classKey, startingPoints = 0) {
    const baseStats = CLASSES[classKey];
    const settings = CLASS_SETTINGS[classKey];
    member.classKey = classKey;
    member.className = baseStats.name;
    member.classBase = { ...baseStats };
    member.race = settings.race;
    member.hp = baseStats.hp;
    member.maxHp = baseStats.maxHp;
    member.attack = baseStats.attack;
    member.defense = baseStats.defense;
    member.armorClass = settings.armorClass;
    member.initiative = 0;
    member.dexterity = 10;
    member.intelligence = 10;
    member.strength = 10;
    member.constitution = 10;
    member.wisdom = 10;
    member.pendingAttributePoints = startingPoints;
    member.clericHealedLevels = [];
    member.inventory = {};
    member.statusEffects = [];
    updateDerivedStats(member);
    member.hp = member.maxHp;
    setMovementAllowance(member);
}

export function addItemToInventory(member, itemKey, count = 1) {
    member.inventory[itemKey] = (member.inventory[itemKey] || 0) + count;
}

export function removeItemFromInventory(member, itemKey, count = 1) {
    if (!member.inventory[itemKey]) return false;
    member.inventory[itemKey] -= count;
    if (member.inventory[itemKey] <= 0) delete member.inventory[itemKey];
    return true;
}

export function addStatusEffect(member, type, duration, magnitude = 0) {
    const existing = member.statusEffects.find(e => e.type === type);
    if (existing) {
        existing.duration = Math.max(existing.duration, duration);
        existing.magnitude = Math.max(existing.magnitude, magnitude);
    } else {
        member.statusEffects.push({ type, duration, magnitude });
    }
}

export function tickStatusEffects(member) {
    for (let i = member.statusEffects.length - 1; i >= 0; i--) {
        const effect = member.statusEffects[i];
        if (effect.type === 'poison') {
            const damage = effect.magnitude || 2;
            member.hp = Math.max(0, member.hp - damage);
        }
        effect.duration--;
        if (effect.duration <= 0) member.statusEffects.splice(i, 1);
    }
}

export function clearStatusEffect(member, type) {
    member.statusEffects = member.statusEffects.filter(e => e.type !== type);
}

export function hasStatusEffect(member, type) {
    return member.statusEffects.some(e => e.type === type);
}

export function getDifficultySettings(game) {
    return DIFFICULTIES[game.difficulty] || DIFFICULTIES.normal;
}

export function experienceRequired(member, partySize) {
    return Math.max(1, Math.ceil(200 * member.level / partySize));
}

export function gainExperience(member, amount, source, game, logMessage) {
    member.xp += amount;
    logMessage(`${member.name} gains ${amount} XP from ${source} (${member.xp}/${experienceRequired(member, game.party.length)} toward next level).`, member);
    checkLevelUp(member, game, logMessage);
}

export function checkLevelUp(member, game, logMessage) {
    while (member.level < MAX_CHARACTER_LEVEL && member.xp >= experienceRequired(member, game.party.length)) {
        member.xp -= experienceRequired(member, game.party.length);
        member.level++;
        const allocated = member.allocatedFields || [];
        const allStats = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'initiative'];
        // Invested stats gain +2 per level. Other stats gain +0.5 per level, banked as
        // half-points so the displayed value stays a whole number (+1 every second level).
        if (!member.halfPoints) member.halfPoints = {};
        for (const stat of allStats) {
            if (allocated.includes(stat)) {
                member[stat] = Math.round((member[stat] || 0) + 2);
            } else {
                member.halfPoints[stat] = (member.halfPoints[stat] || 0) + 1;
                if (member.halfPoints[stat] >= 2) {
                    member.halfPoints[stat] -= 2;
                    member[stat] = Math.round((member[stat] || 0) + 1);
                }
            }
        }
        updateDerivedStats(member);
        member.hp = member.maxHp;
        member.pendingAttributePoints = 0;
        logMessage(`${member.name} reaches level ${member.level}, gains automatic attribution bonuses, and fully heals.`, member);
    }
}

export function removePartyMember(game, memberId, logMessage) {
    const target = game.party.find(m => m.id === memberId);
    if (!target) return false;
    if (game.hasStarted && target.hp > 0) {
        logMessage('Living characters can only be removed before the first move. Fallen characters can be removed any time.', activeMember(game));
        return false;
    }
    if (game.party.length <= 1) {
        logMessage('Cannot remove the last party member!', activeMember(game));
        return false;
    }
    const memberIndex = game.party.findIndex(m => m.id === memberId);
    if (memberIndex === -1) return false;

    const removedWasActive = game.activeMemberIndex === memberIndex;
    const removedName = game.party[memberIndex].name;
    game.party.splice(memberIndex, 1);

    if (removedWasActive) {
        game.activeMemberIndex = Math.min(memberIndex, game.party.length - 1);
        const next = game.party[game.activeMemberIndex];
        if (next.hp <= 0) {
            const living = game.party.findIndex(m => m.hp > 0);
            if (living >= 0) game.activeMemberIndex = living;
        }
    } else if (game.activeMemberIndex > memberIndex) {
        game.activeMemberIndex--;
    }

    game.party.forEach((member, index) => {
        member.color = PLAYER_COLORS[index % PLAYER_COLORS.length];
        member.marker = PLAYER_MARKERS[index % PLAYER_MARKERS.length];
    });
    logMessage(`${removedName} has left the party.`, activeMember(game));
    return true;
}

export function adjacentPartyMembers(game, member) {
    return game.party.filter(other =>
        other !== member && other.hp > 0 && other.position &&
        other.dungeonLevel === member.dungeonLevel &&
        Math.abs(other.position.x - member.position.x) + Math.abs(other.position.y - member.position.y) <= 1
    );
}

export function adjacentDeadPartyMembers(game, member) {
    return game.party.filter(other =>
        other !== member && other.hp <= 0 && other.position &&
        other.dungeonLevel === member.dungeonLevel &&
        Math.abs(other.position.x - member.position.x) + Math.abs(other.position.y - member.position.y) === 1
    );
}

import { PLAYER_COLORS, PLAYER_MARKERS } from './config.js?v=mvvrqkfn';
