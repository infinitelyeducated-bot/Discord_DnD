import { activeMember } from './state.js?v=mvvrqkfn';
import {
    adjacentDeadPartyMembers,
    setMovementAllowance,
    updateDerivedStats,
    experienceRequired,
    gainExperience,
    addItemToInventory,
    tickStatusEffects,
    hasStatusEffect
} from './party.js?v=mvvrqkfn';
import { storeActiveFloor, loadMemberFloor, updateExplored, isWalkable, toggleDoor, getBiome, getItemAt, removeItemAt, isShrineAt, setPartyFormation } from './map.js?v=mvvrqkfn';
import { handleTrap, handleTreasure, attackMonster, enemyTurn, checkPartyDefeat, nearestAttackTarget, useItem, reviveAtShrine } from './combat.js?v=mvvrqkfn';
import { playSound } from './audio.js?v=mvvrqkfn';
import { useAbility, refreshAbilityTurn, restoreCharges } from './abilities.js?v=mvvrqkfn';

// True while the monster phase is running after a turn ends. Every player action
// checks this so a second End Turn (or a key press) cannot skip the next player.
export function isBusy(game) {
    return game.turnEnding === true;
}

export function castAbility(game, slot, logMessage, updateUI, broadcast) {
    if (isBusy(game)) return;
    const member = activeMember(game);
    if (!member || member.hp <= 0 || game.gameOver) return;
    if (hasStatusEffect(member, 'stun')) {
        logMessage(`${member.name} is stunned and cannot act.`, member);
        return;
    }
    playSound('attack');
    const used = useAbility(game, member, slot, logMessage);
    if (used) {
        if (!game.gameOver) finishTurn(game, logMessage, updateUI, broadcast);
    }
    updateUI();
    if (broadcast) broadcast({ type: 'sync', game });
}

export function move(game, direction, logMessage, updateUI, broadcast) {
    if (game.gameOver || isBusy(game)) return;
    const member = activeMember(game);
    if (!member || member.hp <= 0) return;
    if (!game.hasStarted && game.requireAllReady && !game.party.every(m => m.ready === true)) {
        const waiting = game.party.filter(m => !m.ready).map(m => m.name).join(', ');
        logMessage(`Cannot start yet — waiting for: ${waiting}.`, null, 'Game Master');
        return;
    }
    if (member.movesRemaining <= 0) {
        finishTurn(game, logMessage, updateUI, broadcast);
        return;
    }

    const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    const newX = member.position.x + dx;
    const newY = member.position.y + dy;

    if (!isWalkable(game, newX, newY)) {
        const targetCell = game.map[newY]?.[newX];
        if (targetCell === '+') {
            toggleDoor(game, newX, newY, logMessage);
            updateUI();
            if (broadcast) broadcast({ type: 'sync', game });
            return;
        }
        if (targetCell === '≡') {
            logMessage('A chasm blocks the way.', member);
            return;
        }

        logMessage('A wall blocks the way.', member);
        return;
    }

    beginMovement(game, member, logMessage);
    const targetCell = game.map[newY][newX];

    if (targetCell === 'M') {
        member.movesRemaining--;
        playSound('attack');
        const defeated = attackMonster(game, member, newX, newY, logMessage);
        if (defeated && member.hp > 0) {
            member.position = { x: newX, y: newY };
            if (!game.visitedTiles) game.visitedTiles = {};
            game.visitedTiles[`${member.dungeonLevel}:${newX},${newY}`] = true;
            if (game.treasures[`${newX},${newY}`]) {
                handleTreasure(game, newX, newY, logMessage);
                playSound('treasure');
            }
        }
        if (member.hp <= 0 || member.movesRemaining <= 0) finishTurn(game, logMessage, updateUI, broadcast);
        updateExplored(game, member);
        updateUI();
        if (broadcast) broadcast({ type: 'sync', game });
        return;
    }

    // Water slows movement: wading costs 2 movement points instead of 1.
    if (targetCell === '~') {
        if (member.movesRemaining < 2) {
            logMessage('is too tired to wade through the water this turn (needs 2 movement).', member);
            return;
        }
        member.movesRemaining--;
        logMessage('wades through water.', member);
    }
    member.position = { x: newX, y: newY };
    member.movesRemaining--;
    playSound('move');
    const exploreKey = `${member.dungeonLevel}:${newX},${newY}`;
    if (!game.visitedTiles) game.visitedTiles = {};
    if (!game.visitedTiles[exploreKey]) {
        game.visitedTiles[exploreKey] = true;
        gainExperience(member, movementExperience(), 'exploring', game, logMessage);
    }
    logMessage(`moves ${direction} to (${newX + 1}, ${newY + 1}).`, member);

    if (targetCell === '^') handleTrap(game, newX, newY, logMessage);
    if (game.treasures[`${newX},${newY}`]) {
        handleTreasure(game, newX, newY, logMessage);
        playSound('treasure');
    }
    const item = getItemAt(game, newX, newY);
    if (item) {
        addItemToInventory(member, item.key);
        logMessage(`${member.name} picks up ${item.name}.`, member);
        removeItemAt(game, newX, newY);
    }
    if (isShrineAt(game, newX, newY)) {
        reviveAtShrine(game, member, logMessage);
    }
    if (targetCell === '>') {
        offerDescend(game, member, logMessage);
        updateUI();
        if (broadcast) broadcast({ type: 'sync', game });
        return;
    }

    updateExplored(game, member);
    if (member.hp <= 0 || member.movesRemaining <= 0) finishTurn(game, logMessage, updateUI, broadcast);
    updateUI();
    if (broadcast) broadcast({ type: 'sync', game });
}

export function useInventoryItem(game, itemKey, logMessage, updateUI, broadcast) {
    if (isBusy(game)) return;
    const member = activeMember(game);
    if (!member || member.hp <= 0 || game.gameOver) return;
    if (useItem(game, itemKey, member, logMessage)) {
        updateUI();
        if (broadcast) broadcast({ type: 'sync', game });
    }
}

export function setGameDifficulty(game, difficulty, logMessage) {
    if (game.hasStarted) {
        logMessage('Difficulty can only be changed before the first move.', activeMember(game));
        return;
    }
    game.difficulty = difficulty;
    logMessage(`Difficulty set to ${difficulty}.`, null, 'Game Master');
}

export function setFormation(game, formation, logMessage) {
    if (game.hasStarted) {
        logMessage('Formation can only be changed before the first move.', activeMember(game));
        return;
    }
    setPartyFormation(game, formation);
    logMessage(`Party formation set to ${formation}.`, null, 'Game Master');
}

export function attack(game, logMessage, updateUI, broadcast) {
    if (isBusy(game)) return;
    const member = activeMember(game);
    if (!member || member.hp <= 0 || game.gameOver) return;
    const target = nearestAttackTarget(game, member);
    if (!target) {
        logMessage('has no monster in attack range.', member);
        return;
    }
    playSound('attack');
    attackMonster(game, member, target.x, target.y, logMessage);
    if (!game.gameOver) finishTurn(game, logMessage, updateUI, broadcast);
    updateUI();
    if (broadcast) broadcast({ type: 'sync', game });
}

export function standGuard(game, logMessage, updateUI, broadcast) {
    if (isBusy(game)) return;
    const member = activeMember(game);
    if (!member || member.hp <= 0 || game.gameOver || member.guardActive) return;
    const fallen = member.classKey === 'cleric' && member.movesRemaining >= 3
        ? adjacentDeadPartyMembers(game, member)
        : [];
    if (fallen.length) {
        const revived = fallen[0];
        revived.hp = Math.max(1, Math.ceil(revived.maxHp * 0.25));
        revived.guardActive = false;
        member.movesRemaining = 0;
        logMessage(`uses a demanding Guard to bring ${revived.name} back from the dead with ${revived.hp} HP.`, member);
        finishTurn(game, logMessage, updateUI, broadcast);
        updateUI();
        if (broadcast) broadcast({ type: 'sync', game });
        return;
    }
    if (member.hp !== member.maxHp || member.movesRemaining < 2) return;
    member.guardActive = true;
    member.movesRemaining--;
    logMessage('stands guard and can react to a monster within 2 spaces at turn end.', member);
    updateUI();
    if (broadcast) broadcast({ type: 'sync', game });
}

export function rest(game, logMessage, updateUI, broadcast) {
    if (isBusy(game)) return;
    const member = activeMember(game);
    if (!member || member.hp <= 0) return;
    if (hasStatusEffect(member, 'stun')) {
        logMessage(`${member.name} is stunned and cannot rest.`, member);
        return;
    }
    if (member.hp < member.maxHp) {
        const oldHp = member.hp;
        const healAmount = Math.max(1, Math.floor(member.maxHp * 0.3));
        member.hp = Math.min(member.maxHp, member.hp + healAmount);
        restoreCharges(member);
        logMessage(`rests, recovers ${member.hp - oldHp} HP, and restores spell charges.`, member);
    } else {
        restoreCharges(member);
        logMessage('is already at full health; spell charges restored.', member);
    }
    finishTurn(game, logMessage, updateUI, broadcast);
    updateUI();
    if (broadcast) broadcast({ type: 'sync', game });
}

export async function finishTurn(game, logMessage, updateUI, broadcast) {
    if (isBusy(game)) return;
    const member = activeMember(game);
    if (!member) return;
    game.turnEnding = true;
    const started = Date.now();
    try {
        await runTurnEnd(game, member, logMessage, updateUI, broadcast);
    } finally {
        // Keep the lock for a human-visible moment so a double-click or key
        // repeat cannot end the next player's turn as well. Headless callers
        // (tests, bots) pass no UI and are not delayed.
        if (game.turnEndMinMs > 0) {
            const remaining = game.turnEndMinMs - (Date.now() - started);
            if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
        }
        game.turnEnding = false;
        updateUI();
    }
}

async function runTurnEnd(game, member, logMessage, updateUI, broadcast) {
    logMessage('ends their turn.', member);
    tickStatusEffects(member);
    logMessage('--- Monster Phase ---', null, 'Dungeon');
    await enemyTurn(game, member, logMessage, updateUI, broadcast);
    const carryOver = Math.min(2, member.movesRemaining);
    member.movesRemaining = 0;
    if (game.gameOver) {
        updateUI();
        return;
    }
    storeActiveFloor(game, member);

    for (let offset = 1; offset <= game.party.length; offset++) {
        const nextIndex = (game.activeMemberIndex + offset) % game.party.length;
        const nextMember = game.party[nextIndex];
        if (nextMember.hp <= 0) continue;
        game.activeMemberIndex = nextIndex;
        loadMemberFloor(game, nextMember);
        setMovementAllowance(nextMember);
        refreshAbilityTurn(nextMember);
        nextMember.movesRemaining = Math.min(nextMember.movesPerTurn, nextMember.movesRemaining + carryOver);
        updateExplored(game, nextMember);
        logMessage(`begins their turn with ${nextMember.movesPerTurn} movement spaces.`, nextMember);
        updateUI();
        if (broadcast) broadcast({ type: 'sync', game });
        return;
    }
    checkPartyDefeat(game, logMessage);
    updateUI();
    if (broadcast) broadcast({ type: 'sync', game });
}

function beginMovement(game, member, logMessage) {
    if (!game.hasStarted) {
        game.hasStarted = true;
        for (const partyMember of game.party) {
            if (partyMember.pendingAttributePoints > 0) {
                logMessage(`${partyMember.name} forfeits ${partyMember.pendingAttributePoints} unused starting attribution points.`, partyMember);
                partyMember.pendingAttributePoints = 0;
            }
        }
        logMessage('begins the adventure; class and party setup are now locked.', member);
        return;
    }
    if (member.pendingAttributePoints > 0) {
        logMessage(`${member.name} forfeits ${member.pendingAttributePoints} unused attribution points before moving.`, member);
        member.pendingAttributePoints = 0;
    }
}

function offerDescend(game, member, logMessage) {
    const aliveOnFloor = game.party.filter(p =>
        p.dungeonLevel === member.dungeonLevel && p.hp > 0
    );
    const atExit = aliveOnFloor.filter(p =>
        game.exitPositions.some(e => e.x === p.position?.x && e.y === p.position?.y)
    );
    if (aliveOnFloor.length === 1 || atExit.length === aliveOnFloor.length) {
        descendFloor(game, member, logMessage);
    } else {
        logMessage('reaches the exit. Waiting for the rest of the party before descending.', member);
    }
}

export function descendFloor(game, member, logMessage) {
    storeActiveFloor(game, member);
    const oldLevel = member.dungeonLevel;
    member.dungeonLevel++;
    game.turn = member.dungeonLevel - 1;
    for (const partyMember of game.party) {
        if (partyMember.hp <= 0) continue;
        partyMember.dungeonLevel = member.dungeonLevel;
        partyMember.floorPositions[partyMember.dungeonLevel] = null;
    }
    loadMemberFloor(game, member);
    logMessage(`the party descends to dungeon level ${member.dungeonLevel}.`, null, 'Dungeon');
}

function movementExperience() {
    return 3;
}

export { useItem };
