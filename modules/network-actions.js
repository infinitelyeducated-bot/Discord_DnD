import { activeMember } from './state.js?v=mvvrqkfn';
import { move, attack, standGuard, rest, finishTurn, castAbility } from './actions.js?v=mvvrqkfn';
import { deepClone } from './utils.js?v=mvvrqkfn';

const pendingActions = new Map();

export function handleRemoteAction(game, networkManager, data, logMessage, updateUI, broadcast) {
    if (!networkManager?.isHost) return false;
    const { peerId, action, args, actionId } = data;
    const memberId = networkManager.getAssignedMemberId(peerId);
    const member = game.party.find(m => m.id === memberId);

    // setReady is allowed any time before start, only for the peer's own member
    if (action === 'setReady') {
        if (game.hasStarted || !member || member.id !== args.memberId) {
            networkManager.sendTo(peerId, { type: 'actionRejected', actionId, reason: 'cannot change ready state' });
            return false;
        }
        member.ready = args.ready === true;
        logMessage(`${member.name} is ${member.ready ? 'locked in and READY' : 'no longer ready'}.`, member);
        if (!game.hasStarted && game.party.every(m => m.ready === true)) {
            logMessage('All players are locked in and ready — the host may start!', null, 'Game Master');
        }
        networkManager.broadcast({ type: 'actionConfirmed', actionId, game });
        updateUI();
        return true;
    }

    const active = activeMember(game);
    if (!member || !active || member.id !== active.id) {
        networkManager.sendTo(peerId, { type: 'actionRejected', actionId, reason: 'not your turn' });
        return false;
    }

    // In network games the first move requires every player to be ready
    if (!game.hasStarted && !game.party.every(m => m.ready === true)) {
        networkManager.sendTo(peerId, { type: 'actionRejected', actionId, reason: 'waiting for all players to be ready' });
        return false;
    }

    const before = deepClone(game);
    const result = executeAction(game, action, args, logMessage, () => {}, broadcast);
    if (!result) {
        rollback(game, before);
        networkManager.sendTo(peerId, { type: 'actionRejected', actionId, reason: 'invalid action' });
        return false;
    }
    networkManager.broadcast({ type: 'actionConfirmed', actionId, game });
    updateUI();
    return true;
}

function executeAction(game, action, args, logMessage, updateUI, broadcast) {
    switch (action) {
        case 'move':
            move(game, args.direction, logMessage, updateUI, broadcast);
            return true;
        case 'attack':
            attack(game, logMessage, updateUI, broadcast);
            return true;
        case 'guard':
            standGuard(game, logMessage, updateUI, broadcast);
            return true;
        case 'rest':
            rest(game, logMessage, updateUI, broadcast);
            return true;
        case 'endTurn':
            finishTurn(game, logMessage, updateUI, broadcast);
            return true;
        case 'ability':
            castAbility(game, args.slot, logMessage, updateUI, broadcast);
            return true;
        default:
            return false;
    }
}

function rollback(game, before) {
    for (const key of Object.keys(game)) {
        if (key === 'activeMember') continue;
        delete game[key];
    }
    Object.assign(game, before);
}

export function sendLocalAction(networkManager, action, args = {}) {
    if (!networkManager || !networkManager.mode) return null;
    if (networkManager.isHost) return null;
    const actionId = generateActionId();
    pendingActions.set(actionId, { action, args, timestamp: Date.now() });
    networkManager.broadcast({ type: 'action', action, args, actionId });
    return actionId;
}

export function confirmLocalAction(actionId, game) {
    pendingActions.delete(actionId);
}

export function rejectLocalAction(actionId) {
    pendingActions.delete(actionId);
}

function generateActionId() {
    return `a-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}
