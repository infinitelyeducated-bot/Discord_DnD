import { createGame, createPartyMember, activeMember } from './modules/state.js';
import { generateMap } from './modules/map.js';
import { move, attack, rest, finishTurn, descendFloor } from './modules/actions.js';
import { nearestAttackTarget, checkPartyDefeat } from './modules/combat.js';
import { isWalkable } from './modules/map.js';
import { setMovementAllowance } from './modules/party.js';

const DIRECTIONS = ['up', 'down', 'left', 'right'];
const OFFSETS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

function positionKey(x, y) {
    return `${x},${y}`;
}

function distance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function findNearestMonster(game, member) {
    let nearest = null;
    let nearestDist = Infinity;
    for (let y = 1; y < game.mapHeight - 1; y++) {
        for (let x = 1; x < game.mapWidth - 1; x++) {
            if (game.map[y][x] === 'M') {
                const d = distance(member.position, { x, y });
                if (d < nearestDist) {
                    nearestDist = d;
                    nearest = { x, y };
                }
            }
        }
    }
    return nearest;
}

function findNearestExit(game, member) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const exit of game.exitPositions) {
        const d = distance(member.position, exit);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = exit;
        }
    }
    return nearest;
}

function directionToward(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx > 0 ? 'right' : 'left';
    }
    return dy > 0 ? 'down' : 'up';
}

function canMoveInDirection(game, member, direction) {
    const off = OFFSETS[direction];
    return isWalkable(game, member.position.x + off.x, member.position.y + off.y);
}

function runBenchmark() {
    const startTime = performance.now();
    const game = createGame();
    game.difficulty = 'normal';
    createPartyMember(game, 'Aldric', 'fighter');
    createPartyMember(game, 'Brienne', 'rogue');
    createPartyMember(game, 'Cedric', 'wizard');
    createPartyMember(game, 'Dalia', 'cleric');
    createPartyMember(game, 'Elara', 'fighter');
    createPartyMember(game, 'Finn', 'rogue');

    generateMap(game, activeMember(game), () => {});
    game.party.forEach(m => setMovementAllowance(m));

    const log = [];
    const logMessage = (msg, member, actor) => {
        log.push({ msg, member: member?.name || actor });
    };

    let turns = 0;
    let maxTurns = 1000000;
    let actionsThisTurn = 0;

    while (turns < maxTurns) {
        if (game.gameOver) {
            console.log('Game over!');
            break;
        }

        const allMaxLevel = game.party.every(m => m.level >= 30);
        if (allMaxLevel) break;

        const member = activeMember(game);
        if (!member || member.hp <= 0) {
            finishTurn(game, logMessage, () => {}, null);
            turns++;
            continue;
        }

        // Rest if low HP
        if (member.hp < member.maxHp * 0.3 && member.movesRemaining > 0) {
            rest(game, logMessage, () => {}, null);
            turns++;
            continue;
        }

        // Descend if exit is reachable
        const exit = findNearestExit(game, member);
        if (exit && distance(member.position, exit) <= 1 && member.movesRemaining > 0) {
            // Force whole party to exit position and descend
            const living = game.party.filter(p => p.dungeonLevel === member.dungeonLevel && p.hp > 0);
            for (const p of living) {
                p.position = { x: exit.x, y: exit.y };
            }
            descendFloor(game, member, logMessage);
            turns++;
            continue;
        }

        // Attack if possible
        const target = nearestAttackTarget(game, member);
        if (target && member.movesRemaining > 0) {
            attack(game, logMessage, () => {}, null);
            actionsThisTurn++;
            if (member.movesRemaining <= 0) {
                finishTurn(game, logMessage, () => {}, null);
                turns++;
            }
            continue;
        }

        // Move toward nearest monster or explore
        const monster = findNearestMonster(game, member);
        let moved = false;
        if (monster && member.movesRemaining > 0) {
            const dir = directionToward(member.position, monster);
            if (canMoveInDirection(game, member, dir)) {
                move(game, dir, logMessage, () => {}, null);
                moved = true;
            } else {
                // Try other directions
                for (const d of DIRECTIONS) {
                    if (canMoveInDirection(game, member, d)) {
                        move(game, d, logMessage, () => {}, null);
                        moved = true;
                        break;
                    }
                }
            }
        }

        if (!moved || member.movesRemaining <= 0) {
            finishTurn(game, logMessage, () => {}, null);
            turns++;
            continue;
        }

        actionsThisTurn++;
        if (actionsThisTurn > 50) {
            // Safety break
            finishTurn(game, logMessage, () => {}, null);
            turns++;
            actionsThisTurn = 0;
        }
    }

    const elapsed = performance.now() - startTime;
    console.log('\n=== BENCHMARK RESULTS ===');
    console.log(`Total turns: ${turns}`);
    console.log(`Elapsed time: ${(elapsed / 1000).toFixed(2)}s`);
    console.log(`Average ms per turn: ${(elapsed / turns).toFixed(3)}`);
    console.log(`Game over: ${game.gameOver}`);
    console.log('\nParty levels:');
    for (const member of game.party) {
        console.log(`  ${member.name}: level ${member.level}, ${member.xp} XP, ${member.hp}/${member.maxHp} HP`);
    }
    return { turns, elapsed, game };
}

runBenchmark();
