import { move, attack, standGuard, rest, finishTurn, setFormation, setGameDifficulty, useInventoryItem } from './actions.js?v=mvwqbkdq';
import { activeMember } from './state.js?v=mvwqbkdq';
import { nearestAttackTarget } from './combat.js?v=mvwqbkdq';
import { adjacentDeadPartyMembers } from './party.js?v=mvwqbkdq';
import { isWalkable } from './map.js?v=mvwqbkdq';

export function bindInput(game, logMessage, updateUI, broadcast) {
    function localOrSend(action, args, executor) {
        executor();
    }

    document.addEventListener('keydown', event => {
        const menu = document.getElementById('escape-menu');
        if (event.key === 'Escape') {
            event.preventDefault();
            if (menu?.open) menu.close();
            else menu?.showModal();
            return;
        }
        if (menu?.open) return;
        if (game.gameOver) return;
        if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) return;

        switch (event.key.toLowerCase()) {
            case 'w': case 'arrowup':
                event.preventDefault();
                localOrSend('move', { direction: 'up' }, () => move(game, 'up', logMessage, updateUI, broadcast));
                break;
            case 'a': case 'arrowleft':
                event.preventDefault();
                localOrSend('move', { direction: 'left' }, () => move(game, 'left', logMessage, updateUI, broadcast));
                break;
            case 's': case 'arrowdown':
                event.preventDefault();
                localOrSend('move', { direction: 'down' }, () => move(game, 'down', logMessage, updateUI, broadcast));
                break;
            case 'd': case 'arrowright':
                event.preventDefault();
                localOrSend('move', { direction: 'right' }, () => move(game, 'right', logMessage, updateUI, broadcast));
                break;
            case 'f':
                event.preventDefault();
                localOrSend('attack', {}, () => attack(game, logMessage, updateUI, broadcast));
                break;
            case 'r':
                event.preventDefault();
                {
                    const member = activeMember(game);
                    if (member && member.hp < member.maxHp) {
                        localOrSend('rest', {}, () => rest(game, logMessage, updateUI, broadcast));
                    }
                }
                break;
            case 'g':
                event.preventDefault();
                localOrSend('guard', {}, () => standGuard(game, logMessage, updateUI, broadcast));
                break;
            case 'e':
                event.preventDefault();
                localOrSend('endTurn', {}, () => finishTurn(game, logMessage, updateUI, broadcast));
                break;
        }
    });

    document.getElementById('move-up')?.addEventListener('click', () => localOrSend('move', { direction: 'up' }, () => move(game, 'up', logMessage, updateUI, broadcast)));
    document.getElementById('move-left')?.addEventListener('click', () => localOrSend('move', { direction: 'left' }, () => move(game, 'left', logMessage, updateUI, broadcast)));
    document.getElementById('move-down')?.addEventListener('click', () => localOrSend('move', { direction: 'down' }, () => move(game, 'down', logMessage, updateUI, broadcast)));
    document.getElementById('move-right')?.addEventListener('click', () => localOrSend('move', { direction: 'right' }, () => move(game, 'right', logMessage, updateUI, broadcast)));
    document.getElementById('end-turn-btn')?.addEventListener('click', () => localOrSend('endTurn', {}, () => finishTurn(game, logMessage, updateUI, broadcast)));
    document.getElementById('attack-btn')?.addEventListener('click', () => localOrSend('attack', {}, () => attack(game, logMessage, updateUI, broadcast)));
    document.getElementById('rest-btn')?.addEventListener('click', () => localOrSend('rest', {}, () => rest(game, logMessage, updateUI, broadcast)));
    document.getElementById('guard-btn')?.addEventListener('click', () => localOrSend('guard', {}, () => standGuard(game, logMessage, updateUI, broadcast)));

    // Mobile controls
    document.getElementById('mobile-up')?.addEventListener('click', () => localOrSend('move', { direction: 'up' }, () => move(game, 'up', logMessage, updateUI, broadcast)));
    document.getElementById('mobile-down')?.addEventListener('click', () => localOrSend('move', { direction: 'down' }, () => move(game, 'down', logMessage, updateUI, broadcast)));
    document.getElementById('mobile-left')?.addEventListener('click', () => localOrSend('move', { direction: 'left' }, () => move(game, 'left', logMessage, updateUI, broadcast)));
    document.getElementById('mobile-right')?.addEventListener('click', () => localOrSend('move', { direction: 'right' }, () => move(game, 'right', logMessage, updateUI, broadcast)));
    document.getElementById('mobile-action')?.addEventListener('click', () => localOrSend('attack', {}, () => attack(game, logMessage, updateUI, broadcast)));
    document.getElementById('mobile-rest')?.addEventListener('click', () => localOrSend('rest', {}, () => rest(game, logMessage, updateUI, broadcast)));
    document.getElementById('mobile-guard')?.addEventListener('click', () => localOrSend('guard', {}, () => standGuard(game, logMessage, updateUI, broadcast)));
    document.getElementById('mobile-end')?.addEventListener('click', () => localOrSend('endTurn', {}, () => finishTurn(game, logMessage, updateUI, broadcast)));
}

function canMove(game, member, direction) {
    if (!member || member.hp <= 0 || member.movesRemaining <= 0 || game.gameOver) return false;
    const offsets = { up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, right: { x: 1, y: 0 } };
    const offset = offsets[direction];
    return isWalkable(game, member.position.x + offset.x, member.position.y + offset.y);
}
