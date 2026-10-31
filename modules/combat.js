import { POWER_ITEM_DROP_CHANCE, MAX_CHARACTER_LEVEL, ENEMIES, MAX_ENEMY_SCALE_LEVEL, MAX_ENEMY_ATTACK_BONUS, BOSSES, ITEMS } from './config.js?v=mvvrqkfn';
import { positionKey } from './utils.js?v=mvvrqkfn';
import { pathDistanceWithin } from './pathfinding.js?v=mvvrqkfn';
import { addFloatingText } from './ui.js?v=mvvrqkfn';
import { activeMember } from './state.js?v=mvvrqkfn';
import { playSound } from './audio.js?v=mvvrqkfn';
import {
    adjacentPartyMembers,
    adjacentDeadPartyMembers,
    experienceRequired,
    gainExperience,
    updateDerivedStats,
    getDifficultySettings,
    addItemToInventory,
    addStatusEffect,
    tickStatusEffects,
    clearStatusEffect,
    hasStatusEffect
} from './party.js?v=mvvrqkfn';

export function handleTrap(game, x, y, logMessage) {
    const member = activeMember(game);
    if (Math.random() < 0.35 && !hasStatusEffect(member, 'poison')) {
        addStatusEffect(member, 'poison', 3, 2);
        logMessage(`${member.name} is poisoned by the trap!`, member);
    }
    const damage = Math.floor(Math.random() * 5) + 2;
    member.hp = Math.max(0, member.hp - damage);
    addFloatingText(x, y, `-${damage}`, '#ff7043');
    logMessage(`${member.name} triggers a trap and takes ${damage} damage.`, member);
    game.map[y][x] = '.';
    if (member.hp === 0) logMessage(`${member.name} is down!`, member);
}

export function handleTreasure(game, x, y, logMessage) {
    const member = activeMember(game);
    const key = positionKey(x, y);
    const treasure = game.treasures[key];
    if (!treasure) return;
    if (treasure.type === 'power') {
        collectPowerItem(member, game, logMessage);
    } else {
        member.treasureCount++;
        member.treasure += treasure.value;
        logMessage(`${member.name} collects ${treasure.name} worth ${treasure.value} treasure (total ${member.treasure}).`, member);
    }
    delete game.treasures[key];
    game.map[y][x] = '.';
}

export function collectPowerItem(member, game, logMessage) {
    member.treasureCount++;
    member.powerItems++;
    updateDerivedStats(member);
    logMessage(`${member.name} finds a Power Item! Gains 60 XP and +5 damage.`, member);
    gainExperience(member, 60, 'finding a Power Item', game, logMessage);
    playPowerItemSound();
}

function playPowerItemSound() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
        const context = new AudioContextConstructor();
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2200;
        filter.connect(context.destination);
        const now = context.currentTime;
        for (const [index, frequency] of [523.25, 659.25, 783.99, 1046.5].entries()) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sawtooth';
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + index * 0.105);
            gain.gain.linearRampToValueAtTime(0.12, now + index * 0.105 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.105 + 0.19);
            oscillator.connect(gain);
            gain.connect(filter);
            oscillator.start(now + index * 0.105);
            oscillator.stop(now + index * 0.105 + 0.2);
        }
        window.setTimeout(() => context.close(), 700);
    } catch (error) {
        console.error('Power item sound failed:', error);
    }
}

export function attackMonster(game, member, x, y, logMessage) {
    const key = positionKey(x, y);
    const monster = game.monsters[key];
    if (!monster) return false;
    if (hasStatusEffect(member, 'stun')) {
        logMessage(`${member.name} is stunned and cannot attack!`, member);
        return false;
    }

    const distance = pathDistanceWithin(game, member.position, { x, y }, 2);
    const nearbyAllies = adjacentPartyMembers(game, member).filter(ally =>
        Math.abs(ally.position.x - x) + Math.abs(ally.position.y - y) <= 1
    );
    const teamDamageBonus = Math.min(6, nearbyAllies.length * 2);
    const { damage, critical, criticalRoll } = rollAttackDamage(member, distance, teamDamageBonus);
    addFloatingText(x, y, `-${damage}`, '#ef5350');
    playSound('hit');
    monster.hp = Math.max(0, monster.hp - damage);
    logMessage(
        `${member.name} ${critical ? 'critically hits' : 'hits'} ${monster.name} for ${damage} damage` +
        `${critical ? ` (critical roll ${criticalRoll})` : ''}` +
        `${teamDamageBonus ? ` with ${nearbyAllies.length} ally assist(s) (+${teamDamageBonus})` : ''}` +
        ` (${monster.hp}/${monster.maxHp} HP left).`,
        member
    );

    if (monster.hp === 0) {
        const xp = Math.floor(killExperience(member, game) * (getDifficultySettings(game).xpRate));
        logMessage(`${member.name} defeats ${monster.name} and gains ${xp} XP.`, member);
        gainExperience(member, xp, 'defeating a monster', game, logMessage);
        delete game.monsters[key];
        game.map[y][x] = '.';
        if (Math.random() < POWER_ITEM_DROP_CHANCE) {
            logMessage(`${monster.name} drops a Power Item; ${member.name} automatically collects it.`, member);
            collectPowerItem(member, game, logMessage);
        }
        if (Math.random() < 0.15) dropItemAt(game, x, y, logMessage);
        return true;
    }

    if (distance > 1) return false;
    const retaliation = Math.max(1,
        monster.attack - member.defense - Math.min(3, adjacentPartyMembers(game, member).length) +
        Math.floor(Math.random() * 2));
    member.hp = Math.max(0, member.hp - retaliation);
    addFloatingText(member.position.x, member.position.y, `-${retaliation}`, '#ff7043');
    playSound('hit');
    logMessage(`${member.name} is struck by ${monster.name} for ${retaliation} damage.`, member);
    applyMonsterOnHitEffect(monster, member, logMessage);
    if (member.hp === 0) {
        logMessage(`${member.name} is down!`, member);
        downMember(game, member, logMessage);
    }
    return false;
}

function applyMonsterOnHitEffect(monster, member, logMessage) {
    if (monster.ai === 'ranged' && Math.random() < 0.25) {
        addStatusEffect(member, 'poison', 3, 2);
        logMessage(`${member.name} is poisoned by ${monster.name}!`, member);
    } else if (monster.ai === 'brute' && Math.random() < 0.2) {
        addStatusEffect(member, 'slow', 2, 0);
        logMessage(`${member.name} is slowed by ${monster.name}!`, member);
    }
}

function dropItemAt(game, x, y, logMessage) {
    const keys = Object.keys(ITEMS);
    const key = keys[Math.floor(Math.random() * keys.length)];
    game.items = game.items || {};
    game.items[positionKey(x, y)] = { ...ITEMS[key], key };
    logMessage(`A ${ITEMS[key].name} appears on the floor.`, null, 'Dungeon');
}

export async function enemyTurn(game, member, logMessage, updateUI, broadcast) {
    if (member.hp <= 0) return;
    if (hasStatusEffect(member, 'stun')) {
        logMessage(`${member.name} is stunned and cannot guard or act.`, member);
        tickStatusEffects(member);
        return;
    }
    if (member.guardActive) {
        member.guardActive = false;
        resolveGuardReaction(game, member, logMessage);
        tickStatusEffects(member);
        return;
    }

    // Monster AI activation (one at a time with small delay)
    await activateMonsterAI(game, member, logMessage, updateUI, broadcast);

    tickStatusEffects(member);
    if (Math.random() >= 0.3) return;

    let attacker = null;
    let closestDistance = Infinity;
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] !== 'M') continue;
            const distance = pathDistanceWithin(game, { x, y }, member.position, 2);
            if (distance < closestDistance) {
                attacker = game.monsters[positionKey(x, y)];
                closestDistance = distance;
            }
        }
    }
    if (!attacker) return;

    const guardedByParty = Math.min(3, adjacentPartyMembers(game, member).length);
    const damage = Math.max(1,
        attacker.attack - member.defense - guardedByParty + Math.floor(Math.random() * 2));
    member.hp = Math.max(0, member.hp - damage);
    addFloatingText(member.position.x, member.position.y, `-${damage}`, '#ff7043');
    playSound('hit');
    logMessage(`${member.name} is attacked by a nearby ${attacker.name} for ${damage} damage.`, member);
    applyMonsterOnHitEffect(attacker, member, logMessage);
    if (member.hp === 0) {
        logMessage(`${member.name} is down!`, member);
        downMember(game, member, logMessage);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function activateMonsterAI(game, member, logMessage, updateUI, broadcast) {
    const monsterPositions = [];
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] === 'M') {
                const m = game.monsters[positionKey(x, y)];
                if (m) monsterPositions.push({ x, y, monster: m });
            }
        }
    }
    for (const pos of monsterPositions) {
        const m = pos.monster;
        let acted = false;

        // Poison (Rogue's Poison Vial): damage over time, then wears off.
        if (m.poisoned > 0) {
            const tick = Math.max(1, Math.floor(m.maxHp ? m.maxHp * 0.08 : 2));
            m.hp = Math.max(0, m.hp - tick);
            m.poisoned--;
            addFloatingText(pos.x, pos.y, `-${tick} ☠`, '#76ff03');
            logMessage(`${m.name} takes ${tick} poison damage${m.poisoned ? ` (${m.poisoned} turn(s) left)` : ' and the poison wears off'}.`, null, m.name);
            if (m.hp <= 0) {
                delete game.monsters[positionKey(pos.x, pos.y)];
                game.map[pos.y][pos.x] = '.';
                logMessage(`${m.name} succumbs to poison!`, null, m.name);
                acted = true;
                if (updateUI) { updateUI(); if (broadcast) broadcast({ type: 'sync', game }); await delay(250); }
                continue;
            }
            acted = true;
        }

        // Slow (Archer's Pinning Shot): the monster loses every other turn.
        if (m.slowed > 0) {
            m.slowed--;
            m.slowSkip = !m.slowSkip;
            if (m.slowSkip) {
                logMessage(`${m.name} is pinned and cannot act${m.slowed ? '' : '; it shakes the arrow loose'}.`, null, m.name);
                if (updateUI) { updateUI(); if (broadcast) broadcast({ type: 'sync', game }); await delay(250); }
                continue;
            }
            if (!m.slowed) logMessage(`${m.name} is no longer pinned.`, null, m.name);
        }

        const dist = Math.abs(pos.x - member.position.x) + Math.abs(pos.y - member.position.y);
        if (dist > 8) {
            if (acted && updateUI) { updateUI(); if (broadcast) broadcast({ type: 'sync', game }); await delay(250); }
            continue;
        }
        switch (m.ai) {
            case 'ranged':
                if (dist <= 4 && dist > 1) {
                    const damage = Math.max(1, m.attack - member.defense + Math.floor(Math.random() * 2));
                    member.hp = Math.max(0, member.hp - damage);
                    addFloatingText(member.position.x, member.position.y, `-${damage}`, '#ff7043');
                    addFloatingText(pos.x, pos.y, 'RANGED!', '#ff9100');
                    playSound('hit');
                    logMessage(`${m.name} shoots ${member.name} for ${damage} damage.`, null, m.name);
                    applyMonsterOnHitEffect(m, member, logMessage);
                    if (member.hp === 0) downMember(game, member, logMessage);
                    acted = true;
                }
                break;
            case 'fleeing':
                if (dist <= 2) {
                    fleeMonster(game, pos, member);
                    acted = true;
                }
                break;
            case 'pack':
                if (dist <= 5) {
                    const packNearby = monsterPositions.filter(other =>
                        other !== pos && Math.abs(other.x - pos.x) + Math.abs(other.y - pos.y) <= 2
                    ).length;
                    if (packNearby >= 1 && Math.random() < 0.35) {
                        moveMonsterToward(game, pos, member.position);
                        acted = true;
                    }
                }
                break;
            case 'patrol':
                if (dist <= 6 && Math.random() < 0.25) {
                    moveMonsterToward(game, pos, member.position);
                    acted = true;
                }
                break;
            case 'brute':
            default:
                if (dist <= 4 && Math.random() < 0.2) {
                    moveMonsterToward(game, pos, member.position);
                    acted = true;
                }
                break;
        }
        if (acted && updateUI) {
            updateUI();
            if (broadcast) broadcast({ type: 'sync', game });
            await delay(250);
        }
    }
}

function moveMonsterToward(game, pos, target) {
    let best = null;
    let bestDist = Math.abs(pos.x - target.x) + Math.abs(pos.y - target.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = pos.x + dx, ny = pos.y + dy;
        if (game.map[ny]?.[nx] !== '.') continue;
        const d = Math.abs(nx - target.x) + Math.abs(ny - target.y);
        if (d < bestDist) {
            bestDist = d;
            best = { x: nx, y: ny };
        }
    }
    if (!best) return;
    const key = positionKey(pos.x, pos.y);
    const newKey = positionKey(best.x, best.y);
    game.map[pos.y][pos.x] = '.';
    game.map[best.y][best.x] = 'M';
    game.monsters[newKey] = game.monsters[key];
    delete game.monsters[key];
}

function fleeMonster(game, pos, member) {
    let best = null;
    let bestDist = Math.abs(pos.x - member.position.x) + Math.abs(pos.y - member.position.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = pos.x + dx, ny = pos.y + dy;
        if (game.map[ny]?.[nx] !== '.') continue;
        const d = Math.abs(nx - member.position.x) + Math.abs(ny - member.position.y);
        if (d > bestDist) {
            bestDist = d;
            best = { x: nx, y: ny };
        }
    }
    if (!best) return;
    const key = positionKey(pos.x, pos.y);
    const newKey = positionKey(best.x, best.y);
    game.map[pos.y][pos.x] = '.';
    game.map[best.y][best.x] = 'M';
    game.monsters[newKey] = game.monsters[key];
    delete game.monsters[key];
}

function resolveGuardReaction(game, member, logMessage) {
    let nearestPosition = null;
    let nearestDistance = Infinity;
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] !== 'M') continue;
            const distance = pathDistanceWithin(game, { x, y }, member.position, 2);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPosition = { x, y };
            }
        }
    }
    if (nearestPosition) {
        const monster = game.monsters[positionKey(nearestPosition.x, nearestPosition.y)];
        const alliesHelping = adjacentPartyMembers(game, member).filter(ally =>
            Math.abs(ally.position.x - nearestPosition.x) + Math.abs(ally.position.y - nearestPosition.y) <= 1
        );
        const { damage, critical, criticalRoll } = rollAttackDamage(member, nearestDistance, Math.min(6, alliesHelping.length * 2));
        monster.hp = Math.max(0, monster.hp - damage);
        logMessage(
            `${member.name} reacts to ${monster.name} and ${critical ? 'critically hits' : 'strikes'} for ${damage} damage` +
            `${alliesHelping.length ? ` with ${alliesHelping.length} ally assist(s)` : ''}` +
            `${critical ? ` (critical roll ${criticalRoll})` : ''}.`,
            member
        );
        if (monster.hp === 0) {
            const xp = killExperience(member, game);
            logMessage(`${member.name} defeats ${monster.name} and gains ${xp} XP.`, member);
            gainExperience(member, xp, 'defeating a monster', game, logMessage);
            delete game.monsters[positionKey(nearestPosition.x, nearestPosition.y)];
            game.map[nearestPosition.y][nearestPosition.x] = '.';
        }
    } else {
        logMessage(`${member.name} stands guard, but no monster comes within 2 spaces.`, member);
    }
    if (member.classKey === 'cleric') attemptClericGuardHeal(game, member, logMessage);
}

function attemptClericGuardHeal(game, cleric, logMessage) {
    if (cleric.clericHealedLevels.includes(cleric.dungeonLevel)) return;
    const adjacentMembers = game.party.filter(member =>
        member !== cleric && member.hp > 0 && member.position &&
        member.dungeonLevel === cleric.dungeonLevel &&
        Math.abs(member.position.x - cleric.position.x) + Math.abs(member.position.y - cleric.position.y) === 1
    ).filter(member => member.hp < member.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (!adjacentMembers.length) {
        logMessage(`${cleric.name} has no injured adjacent party member to heal while guarding.`, cleric);
        return;
    }
    const chance = Math.min(100, cleric.intelligence * cleric.level);
    if (Math.random() * 100 >= chance) {
        logMessage(`${cleric.name} fails to heal while guarding (${chance}% chance).`, cleric);
        return;
    }
    const target = adjacentMembers[0];
    const healed = target.maxHp - target.hp;
    target.hp = target.maxHp;
    cleric.clericHealedLevels.push(cleric.dungeonLevel);
    logMessage(`${cleric.name} fully heals adjacent ${target.name} for ${healed} HP while guarding.`, cleric);
}

export function rollAttackDamage(member, distance, teamDamageBonus = 0) {
    const wizardRangedAttack = member.classKey === 'wizard' && distance <= 2 && member.movesRemaining > 0;
    const criticalRoll = Math.floor(Math.random() * 6) + 1 + criticalRollBonus(member, wizardRangedAttack);
    const critical = criticalRoll >= 6;
    const rogueBonus = member.classKey === 'rogue' ? member.initiative * 1.5 : 0;
    const baseDamage = Math.max(1,
        member.attack + rogueBonus + teamDamageBonus + Math.floor(Math.random() * 3));
    return {
        damage: critical ? baseDamage * 2 : baseDamage,
        critical,
        criticalRoll
    };
}

function criticalRollBonus(member, wizardRangedAttack = false) {
    const invested = stat => Math.max(0, member[stat] - 10);
    switch (member.classKey) {
        case 'fighter': return invested('strength');
        case 'rogue': return invested('dexterity') + member.initiative;
        case 'wizard': return wizardRangedAttack ? invested('intelligence') : 0;
        case 'cleric': return invested('wisdom');
        default: return 0;
    }
}

export function killExperience(member, game) {
    const baseExperience = member.dungeonLevel >= 15 ? 25 : 10;
    return baseExperience + Math.floor(member.wisdom / 5);
}

export function movementExperience() {
    return 3;
}

export function checkPartyDefeat(game, logMessage) {
    const living = game.party.filter(member => member.hp > 0).length;
    if (living === 0) {
        game.gameOver = true;
        logMessage('The entire party has fallen. Game over.', null, 'Dungeon');
    }
}

export function downMember(game, member, logMessage) {
    const diff = getDifficultySettings(game);
    if (diff.permadeath) {
        logMessage(`${member.name} has fallen permanently.`, member);
        game.gameOver = game.party.every(m => m.hp <= 0);
        if (game.gameOver) logMessage('Permadeath claims the party. Game over.', null, 'Dungeon');
        return;
    }
    member.hp = 0;
    if (Math.random() < 0.3) {
        member.hp = Math.max(1, Math.ceil(member.maxHp * 0.25));
        logMessage(`${member.name} makes a death saving throw and clings to life with ${member.hp} HP!`, member);
        return;
    }
    logMessage(`${member.name} is down!`, member);
    checkPartyDefeat(game, logMessage);
}

export function reviveAtShrine(game, member, logMessage) {
    const shrineKey = positionKey(member.position.x, member.position.y);
    if (game.shrinesUsed[shrineKey]) {
        logMessage('This shrine has already been used.', member);
        return false;
    }
    const fallen = game.party.find(m => m.hp <= 0);
    if (!fallen) {
        logMessage('No fallen party members to revive.', member);
        return false;
    }
    fallen.hp = Math.max(1, Math.ceil(fallen.maxHp * 0.5));
    fallen.position = { ...member.position };
    fallen.dungeonLevel = member.dungeonLevel;
    fallen.statusEffects = [];
    game.shrinesUsed[shrineKey] = true;
    logMessage(`${fallen.name} is revived at the shrine with ${fallen.hp} HP!`, null, 'Shrine');
    return true;
}

export function useItem(game, itemKey, member, logMessage) {
    const item = ITEMS[itemKey];
    if (!item || !member.inventory[itemKey]) {
        logMessage(`${member.name} does not have that item.`, member);
        return false;
    }
    let consumed = true;
    switch (item.effect) {
        case 'heal':
            const oldHp = member.hp;
            member.hp = Math.min(member.maxHp, member.hp + item.value);
            logMessage(`${member.name} drinks a ${item.name} and recovers ${member.hp - oldHp} HP.`, member);
            break;
        case 'bless':
            addStatusEffect(member, 'bless', item.duration, 2);
            updateDerivedStats(member);
            logMessage(`${member.name} reads a ${item.name} and is blessed.`, member);
            break;
        case 'haste':
            addStatusEffect(member, 'haste', item.duration, 2);
            setMovementAllowance(member);
            logMessage(`${member.name} drinks a ${item.name} and gains haste.`, member);
            break;
        case 'cure':
            clearStatusEffect(member, 'poison');
            logMessage(`${member.name} uses an ${item.name} and cures poison.`, member);
            break;
        case 'key':
            logMessage(`${member.name} holds up a ${item.name} for a locked door.`, member);
            consumed = false;
            break;
        default:
            logMessage(`${member.name} uses ${item.name}.`, member);
    }
    if (consumed) {
        removeItemFromInventory(member, itemKey);
    }
    return true;
}

import { removeItemFromInventory, setMovementAllowance } from './party.js?v=mvvrqkfn';

export function nearestAttackTarget(game, member) {
    if (!member?.position) return null;
    const attackRange = member.classKey === 'wizard' && member.movesRemaining > 0 ? 2 : 1;
    let nearest = null;
    let nearestDistance = Infinity;
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] !== 'M') continue;
            const distance = pathDistanceWithin(game, member.position, { x, y }, attackRange);
            if (distance > 0 && distance <= attackRange && distance < nearestDistance) {
                nearest = { x, y };
                nearestDistance = distance;
            }
        }
    }
    return nearest;
}
