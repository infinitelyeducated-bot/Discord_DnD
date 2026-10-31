import { createGame, createPartyMember, activeMember, persistSnapshot, loadStoredSnapshot, saveSnapshot, listSaveSlots, saveSlot, loadSlot, deleteSlot } from './state.js?v=mvwq2xf0';
import { generateMap, storeActiveFloor, loadMemberFloor, setPartyFormation, isWalkable, placeNewMember } from './map.js?v=mvwq2xf0';
import { applyCharacterClass, updateDerivedStats, setMovementAllowance, getDifficultySettings, adjacentDeadPartyMembers } from './party.js?v=mvwq2xf0';
import { createLogger } from './log.js?v=mvwq2xf0';
import { LayoutManager } from './layout.js?v=mvwq2xf0';
import { DiscordRelay } from './discord.js?v=mvwq2xf0';
import { handleChatBubble, bindBubbles, updateBubbles, setBubbleDuration } from './bubbles.js?v=mvwq2xf0';
import { renderMap, renderLegend, updateActionButtons, renderCharacterSheets, updateMapSizing, centerMapOnActiveMember, renderMinimap, renderTurnOrder, renderFloatingTexts, updateFloatingTexts, renderTopPartyRow } from './ui.js?v=mvwq2xf0';
import { bindInput } from './input.js?v=mvwq2xf0';
import { nearestAttackTarget } from './combat.js?v=mvwq2xf0';
import { MAX_PARTY_SIZE, CLASSES, DIFFICULTIES, ITEMS } from './config.js?v=mvwq2xf0';

let game = createGame();
let gameLog = [];
let logMessage = createLogger(gameLog, appendLogRecord);
let layoutManager = new LayoutManager();
let discordRelay = null;

// In the browser, keep the turn lock for at least this long so a double-click on
// End Turn cannot end the next player's turn too. Bots and tests leave it at 0.
const TURN_END_MIN_MS = 350;

function initGame() {
    const stored = loadStoredSnapshot();
    if (stored) {
        game = stored.game;
        gameLog = stored.log;
        logMessage = createLogger(gameLog, appendLogRecord);
    } else {
        startNewGame();
    }
    game.turnEndMinMs = TURN_END_MIN_MS;
}

function startNewGame() {
    game = createGame();
    game.turnEndMinMs = TURN_END_MIN_MS;
    setPartyFormation(game, 'cluster');
    game.difficulty = 'normal';
    gameLog = [];
    logMessage = createLogger(gameLog, appendLogRecord);
    createPartyMember(game, 'Aldric', 'fighter');
    createPartyMember(game, 'Brienne', 'rogue');
    createPartyMember(game, 'Cedric', 'wizard');
    createPartyMember(game, 'Dalia', 'cleric');
    createPartyMember(game, 'Elara', 'archer');
    createPartyMember(game, 'Finn', 'rogue');
    generateMap(game, activeMember(game), logMessage);
    updateUI();
    logMessage('Welcome to the ASCII Dungeon! Navigate to find treasure and defeat enemies.', null, 'Dungeon');
    logMessage('DM distributes 3 points per character before the first move; unused points are forfeited. On level, +2 to invested stats and +1 every second level to others.', activeMember(game));
}

export function updateUI() {
    bindBubbles(game);
    renderMap(game, document.getElementById('dungeon-map-content'));
    renderMinimap(game, document.getElementById('minimap'));
    renderLegend(game, document.getElementById('player-legend-markers'));
    renderTurnOrder(game, document.getElementById('turn-order-bar'));
    renderTopPartyRow(game, document.getElementById('top-party-row'));
    renderFloatingTexts(game, document.getElementById('bubble-layer'));
    const biome = game.biome;
    const levelTitle = document.getElementById('level-title');
    levelTitle.textContent = `${biome ? biome.name + ' — ' : ''}DUNGEON LEVEL ${activeMember(game)?.dungeonLevel || 1}`;
    updateActionButtons(game);
    updateMobileButtons(game);
    updateAbilityUI(game);
    renderInventoryPanel(game);
    renderCharacterSheets(game, document.getElementById('character-sheet-list'));
    layoutManager.refresh();
    updateMapSizing();
    centerMapOnActiveMember(game);
}

function renderInventoryPanel(game) {
    const panel = document.getElementById('inventory-panel');
    if (!panel) return;
    panel.replaceChildren();
    const member = activeMember(game);
    if (!member || !Object.keys(member.inventory || {}).length) {
        panel.textContent = 'No items.';
        return;
    }
    for (const [key, count] of Object.entries(member.inventory)) {
        const item = ITEMS[key];
        if (!item) continue;
        const btn = document.createElement('button');
        btn.className = 'inventory-item';
        btn.textContent = `${item.icon} ${item.name} x${count}`;
        btn.title = item.description;
        btn.disabled = member.hp <= 0 || game.gameOver;
        btn.addEventListener('click', () => {
            import('./actions.js?v=mvwq2xf0').then(m => {
                m.useInventoryItem(game, key, logMessage, updateUI, broadcast);
            });
        });
        panel.appendChild(btn);
    }
}

function updateMobileButtons(game) {
    const member = activeMember(game);
    const canAct = Boolean(member && member.hp > 0 && !game.gameOver);
    const directions = {
        'mobile-up': 'up', 'mobile-down': 'down', 'mobile-left': 'left', 'mobile-right': 'right'
    };
    for (const [id, dir] of Object.entries(directions)) {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !(canAct && canMove(game, member, dir));
    }
    const attackBtn = document.getElementById('mobile-action');
    if (attackBtn) attackBtn.disabled = !(canAct && Boolean(nearestAttackTarget(game, member)));
    const restBtn = document.getElementById('mobile-rest');
    if (restBtn) restBtn.disabled = !(canAct && member.hp < member.maxHp);
    const guardBtn = document.getElementById('mobile-guard');
    if (guardBtn) {
        const canRevive = canAct && member.classKey === 'cleric' &&
            member.movesRemaining >= 3 && adjacentDeadPartyMembers(game, member).length > 0;
        guardBtn.disabled = !(canAct && !member.guardActive &&
            (canRevive || (member.hp === member.maxHp && member.movesRemaining >= 2)));
    }
    const endBtn = document.getElementById('mobile-end');
    if (endBtn) endBtn.disabled = !canAct;
}

function canMove(game, member, direction) {
    if (!member || member.hp <= 0 || member.movesRemaining <= 0 || game.gameOver) return false;
    const offsets = { up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, right: { x: 1, y: 0 } };
    const offset = offsets[direction];
    return isWalkable(game, member.position.x + offset.x, member.position.y + offset.y);
}

function appendLogRecord(record) {
    if (discordRelay?.isDm && record?.message) {
        const line = String(record.message).split(String.fromCharCode(10))[0];
        if (line.trim()) discordRelay.relayLog(line.slice(0, 120), record.actorName || 'Dungeon');
    }
    if (record && record.message && record.memberId) {
        const firstLine = String(record.message).split(String.fromCharCode(10))[0];
        if (firstLine.length > 4) handleChatBubble({ sender: record.actorName || 'Dungeon', memberId: record.memberId, text: firstLine, timestamp: Date.now() });
    }
    const logPanel = document.getElementById('game-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const timestamp = document.createElement('span');
    timestamp.style.color = '#ffcc00';
    timestamp.textContent = `[${record.timestamp}] `;
    const name = document.createElement('strong');
    const member = game.party.find(p => p.id === record.memberId);
    name.style.color = member ? member.color : '#ffcc00';
    name.textContent = member ? member.name : record.actorName;
    entry.append(timestamp, name, document.createTextNode(` ${record.message}`));
    logPanel.appendChild(entry);
    while (logPanel.children.length > 200) logPanel.firstElementChild.remove();
    logPanel.scrollTop = logPanel.scrollHeight;
}

function populateSaveSlotSelect() {
    const slotSelect = document.getElementById('save-slot-select');
    if (!slotSelect) return;
    const currentValue = slotSelect.value;
    slotSelect.innerHTML = '';
    const slots = listSaveSlots();
    const slotNames = Object.keys(slots).sort();
    if (slotNames.length === 0) {
        const option = document.createElement('option');
        option.value = 'Auto';
        option.textContent = 'Auto (empty)';
        slotSelect.appendChild(option);
    } else {
        for (const name of slotNames) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            slotSelect.appendChild(option);
        }
    }
    if (currentValue && slotNames.includes(currentValue)) slotSelect.value = currentValue;
}

function renderSavedLog() {
    const logPanel = document.getElementById('game-log');
    logPanel.replaceChildren();
    for (const record of gameLog) appendLogRecord(record);
}

function broadcast() {
    // Discord relay is the only network path in this edition; game state is
    // not synced between copies (the DM's screen is the shared view).
}


// Turn timer (local): ends the active turn when the countdown reaches zero.
let turnTimer = null;
let turnTimeLeft = 0;
let turnTimerDuration = 0;
function startTurnTimer(seconds) {
    stopTurnTimer();
    turnTimerDuration = seconds;
    turnTimeLeft = seconds;
    const timerDisplay = document.getElementById('turn-timer');
    turnTimer = window.setInterval(() => {
        turnTimeLeft--;
        if (timerDisplay) timerDisplay.textContent = turnTimeLeft + 's / ' + turnTimerDuration + 's';
        if (turnTimeLeft <= 0) {
            stopTurnTimer();
            logMessage('Turn timer expired.', activeMember(game));
            import('./actions.js?v=mvwq2xf0').then(m => m.finishTurn(game, logMessage, updateUI, broadcast));
        }
    }, 1000);
}
function stopTurnTimer() {
    if (turnTimer) { window.clearInterval(turnTimer); turnTimer = null; }
}
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function bindGameUI() {
    const addClassSelect = document.getElementById('add-member-class');
    if (addClassSelect) {
        for (const [classKey, characterClass] of Object.entries(CLASSES)) {
            const option = document.createElement('option');
            option.value = classKey;
            option.textContent = characterClass.name;
            addClassSelect.appendChild(option);
        }
    }
    document.getElementById('add-member-btn')?.addEventListener('click', () => {
        const classKey = document.getElementById('add-member-class')?.value || Object.keys(CLASSES)[0];
        const added = createPartyMember(game, `Adventurer ${game.party.length + 1}`, classKey);
        if (added) {
            placeNewMember(game, added);
            logMessage(`${added.name} the ${added.className} joins the party.`, added);
        }
        refreshPartySetupMap();
        updateUI();
    });
    document.getElementById('remove-member-btn')?.addEventListener('click', () => {
        if (game.party.length <= 1) {
            logMessage('Cannot remove the last party member!', activeMember(game));
            return;
        }
        const active = activeMember(game);
        if (active) removePartyMember(game, active.id, logMessage);
        refreshPartySetupMap();
        updateUI();
    });
    document.getElementById('character-sheet-list')?.addEventListener('click', event => {
        const button = event.target.closest('.sheet-remove-btn');
        if (!button) return;
        if (game.party.length <= 1) {
            logMessage('Cannot remove the last party member!', activeMember(game));
            return;
        }
        const memberId = Number(button.dataset.removeMemberId);
        removePartyMember(game, memberId, logMessage);
        refreshPartySetupMap();
        updateUI();
    });
    document.getElementById('gm-starting-points')?.addEventListener('change', event => {
        setStartingPoints(event.target);
    });
    document.getElementById('difficulty-select')?.addEventListener('change', event => {
        import('./actions.js?v=mvwq2xf0').then(m => m.setGameDifficulty(game, event.target.value, logMessage));
        updateUI();
    });
    document.getElementById('formation-select')?.addEventListener('change', event => {
        import('./actions.js?v=mvwq2xf0').then(m => m.setFormation(game, event.target.value, logMessage));
        updateUI();
    });
    document.getElementById('resume-button')?.addEventListener('click', () => {
        document.getElementById('escape-menu').close();
    });
    document.getElementById('open-readme-button')?.addEventListener('click', () => {
        document.getElementById('escape-menu')?.close();
        document.getElementById('readme-dialog')?.showModal();
    });
    document.getElementById('readme-close-top')?.addEventListener('click', () => document.getElementById('readme-dialog')?.close());
    document.getElementById('readme-close-bottom')?.addEventListener('click', () => document.getElementById('readme-dialog')?.close());
    const printReadme = () => {
        // A modal dialog sits in the browser top layer, which clips printing
        // to a single page. Close it first; print CSS shows its content as
        // normal flowing block content, then reopen afterwards.
        document.getElementById('readme-dialog')?.close();
        document.body.classList.add('printing-readme');
        window.print();
    };
    window.addEventListener('afterprint', () => {
        if (document.body.classList.contains('printing-readme')) {
            document.body.classList.remove('printing-readme');
            document.getElementById('readme-dialog')?.showModal();
        }
    });
    document.getElementById('readme-print-top')?.addEventListener('click', printReadme);
    document.getElementById('readme-print-bottom')?.addEventListener('click', printReadme);
    document.getElementById('open-sheets-button')?.addEventListener('click', () => {
        document.getElementById('escape-menu').close();
        document.getElementById('character-sheets').scrollIntoView({ behavior: 'smooth' });
        document.querySelector('#character-sheet-list input')?.focus({ preventScroll: true });
    });
    document.getElementById('save-game-button')?.addEventListener('click', () => {
        const slotSelect = document.getElementById('save-slot-select');
        const slotName = slotSelect?.value?.trim() || 'Auto';
        const success = saveSlot(slotName, game, gameLog);
        document.getElementById('save-status').textContent = success ? `Saved to slot "${slotName}".` : 'Save failed.';
        populateSaveSlotSelect();
    });
    document.getElementById('load-game-button')?.addEventListener('click', () => {
        const slotSelect = document.getElementById('save-slot-select');
        const slotName = slotSelect?.value?.trim();
        if (!slotName) {
            document.getElementById('save-status').textContent = 'Select a save slot to load.';
            return;
        }
        const exists = Object.hasOwn(listSaveSlots(), slotName);
        const stored = loadSlot(slotName);
        if (!stored) {
            document.getElementById('save-status').textContent = exists
                ? `Save "${slotName}" is damaged or from an incompatible version and could not be loaded.`
                : `No save found in "${slotName}".`;
            return;
        }
        if (!confirm(`Load slot "${slotName}"? This will replace your current game.`)) return;
        game = stored.game;
        game.turnEndMinMs = TURN_END_MIN_MS;
        gameLog = stored.log;
        logMessage = createLogger(gameLog, appendLogRecord);
        renderSavedLog();
        updateUI();
        document.getElementById('save-status').textContent = `Loaded slot "${slotName}".`;
        document.getElementById('escape-menu').close();
    });
    document.getElementById('delete-save-slot-button')?.addEventListener('click', () => {
        const slotSelect = document.getElementById('save-slot-select');
        const slotName = slotSelect?.value?.trim();
        if (!slotName) return;
        if (!confirm(`Delete save slot "${slotName}"?`)) return;
        deleteSlot(slotName);
        populateSaveSlotSelect();
        document.getElementById('save-status').textContent = `Deleted slot "${slotName}".`;
    });
    document.getElementById('descend-button')?.addEventListener('click', () => {
        const member = activeMember(game);
        if (member) {
            import('./actions.js?v=mvwq2xf0').then(m => {
                m.descendFloor(game, member, logMessage);
                updateUI();
            });
        }
    });
    document.getElementById('reset-game-button')?.addEventListener('click', startNewGame);
    document.getElementById('fullscreen-toggle')?.addEventListener('click', () => {
        document.getElementById('map-column')?.classList.toggle('fullscreen');
        updateMapSizing();
        centerMapOnActiveMember(game);
    });
    document.getElementById('toggle-layout-edit-button')?.addEventListener('click', () => {
        layoutManager.setEditMode(!layoutManager.layoutEditMode);
        if (layoutManager.layoutEditMode) document.getElementById('escape-menu').close();
    });
    document.getElementById('reset-layout-button')?.addEventListener('click', () => layoutManager.reset());

    const discordButton = document.getElementById('network-button');
    const discordDialog = document.getElementById('network-dialog');
    discordButton?.addEventListener('click', () => discordDialog?.showModal());
    discordDialog?.addEventListener('click', event => {
        if (event.target === discordDialog) discordDialog.close();
    });

    const cancelBtn = document.getElementById('network-cancel');
    cancelBtn?.addEventListener('click', () => document.getElementById('network-dialog')?.close());
    document.getElementById('turn-timer-toggle')?.addEventListener('change', event => {
        const seconds = Number(document.getElementById('turn-timer-seconds')?.value || 60);
        if (event.target.checked) startTurnTimer(seconds);
        else { stopTurnTimer(); const td = document.getElementById('turn-timer'); if (td) td.textContent = ''; }
    });

    document.getElementById('character-sheet-list')?.addEventListener('change', event => {
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
        if (event.target.classList.contains('sheet-ready-box')) {
            handleReadyToggle(event.target);
            return;
        }
        if (!event.target.dataset.pointStat) updateCharacterField(event.target);
    });
    document.getElementById('character-sheet-list')?.addEventListener('click', event => {
        if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.pointStat) return;
        updateAttributePoints(event.target, 1);
    });
    document.getElementById('character-sheet-list')?.addEventListener('contextmenu', event => {
        if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.pointStat) return;
        event.preventDefault();
        updateAttributePoints(event.target, -1);
    });
}

function handleReadyToggle(box) {
    const member = game.party.find(item => item.id === Number(box.dataset.readyMemberId));
    if (!member) return;
    if (box.checked) {
        const ok = confirm(
            `Lock in ${member.name}?\n\n` +
            `Name, class and attribute points become FINAL for this player. ` +
            `Uncheck Ready later if you need to change something before the game starts.\n\n` +
            `When every player is ready, the game can begin.`
        );
        if (!ok) {
            box.checked = false;
            return;
        }
        member.ready = true;
        logMessage(`${member.name} is locked in and READY to play.`, member);
    } else {
        member.ready = false;
        logMessage(`${member.name} is no longer ready.`, member);
    }
    maybeAnnounceAllReady();
    updateUI();
}

function maybeAnnounceAllReady() {
    if (game.hasStarted) return;
    const allReady = game.party.length > 0 && game.party.every(m => m.ready === true);
    if (allReady) {
        logMessage('All players are locked in and ready — the adventure can begin! (Any move starts the game.)', null, 'Game Master');
        if (discordRelay?.isDm) {
            discordRelay.relayChat('All players are locked in and ready — the adventure can begin!', 'Game Master');
        }
    }
}

function updateCharacterField(input) {
    const member = game.party.find(item => item.id === Number(input.dataset.memberId));
    if (!member) return;
    const field = input.dataset.field;
    if (field === 'classKey') {
        if (game.hasStarted || !CLASSES[input.value]) {
            updateUI();
            return;
        }
        applyCharacterClass(member, input.value, game.startingPointsPerPlayer || 0);
        logMessage(`${member.name} changes class to ${member.className}.`, member);
        updateUI();
        return;
    }
    const textFields = ['name', 'race'];
    if (textFields.includes(field)) {
        const value = input.value.trim();
        if (!value || value.length > 60) {
            logMessage(`${field} must contain 1 to 60 characters.`, member);
            updateUI();
            return;
        }
        member[field] = value;
    } else {
        const value = Number(input.value);
        const bounds = { hp: [0, member.maxHp] }[field];
        if (!bounds || !Number.isInteger(value) || value < bounds[0] || value > bounds[1]) {
            logMessage(`The ${field} value is outside its allowed range.`, member);
            updateUI();
            return;
        }
        member[field] = value;
    }
    if (field === 'hp') {
        member.movesPerTurn = movementAllowance(member);
        member.movesRemaining = Math.min(member.movesRemaining, member.movesPerTurn);
    }
    logMessage(`${member.name} updates ${field} on the character sheet.`, member);
    updateUI();
}

function updateAttributePoints(input, direction) {
    const member = game.party.find(item => item.id === Number(input.dataset.memberId));
    const stat = input.dataset.pointStat;
    if (!member || !stat || (direction !== 1 && direction !== -1)) return;
    const baseValue = stat === 'initiative' ? 0 : 10;
    if (direction === 1 && member.pendingAttributePoints <= 0) {
        logMessage(`${member.name} has no attribution points available to add to ${stat}.`, member);
        return;
    }
    const value = member[stat] + direction;
    if (direction === 1 && !member.allocatedFields.includes(stat)) member.allocatedFields.push(stat);
    if (value < baseValue || value > 99) {
        logMessage(`${stat} must remain between ${baseValue} and 99.`, member);
        updateUI();
        return;
    }
    const oldMaxHp = member.maxHp;
    member[stat] = value;
    member.pendingAttributePoints -= direction;
    updateDerivedStats(member);
    if (stat === 'constitution') {
        member.hp = Math.max(0, Math.min(member.maxHp, member.hp + member.maxHp - oldMaxHp));
    }
    logMessage(`${member.name} ${direction === 1 ? 'adds a point to' : 'removes a point from'} ${stat}.`, member);
    updateUI();
}

function setStartingPoints(input) {
    if (game.hasStarted) return;
    if (input.value === '') {
        game.startingPointsPerPlayer = null;
        for (const member of game.party) {
            member.pendingAttributePoints = 0;
            member.initiative = 0;
            member.dexterity = 10;
            member.intelligence = 10;
            member.strength = 10;
            member.constitution = 10;
            member.wisdom = 10;
            updateDerivedStats(member);
            member.hp = Math.min(member.hp, member.maxHp);
        }
        updateUI();
        return;
    }
    const points = Number(input.value);
    if (!Number.isInteger(points) || points < 0 || points > 544) {
        input.value = game.startingPointsPerPlayer ?? '';
        logMessage('GM starting points must be a whole number from 0 to 544.', null, 'Party Setup');
        return;
    }
    game.startingPointsPerPlayer = points;
    for (const member of game.party) {
        member.pendingAttributePoints = points;
        member.allocatedFields = [];
        member.initiative = 0;
        member.dexterity = 10;
        member.intelligence = 10;
        member.strength = 10;
        member.constitution = 10;
        member.wisdom = 10;
        updateDerivedStats(member);
        member.hp = Math.min(member.hp, member.maxHp);
    }
    logMessage(`sets ${points} starting attribution point(s) for each player.`, null, 'Game Master');
    updateUI();
}

function refreshPartySetupMap() {
    // placeholder for any party-change map adjustments
}

import { movementAllowance } from './party.js?v=mvwq2xf0';
import { removePartyMember } from './party.js?v=mvwq2xf0';


function setupDiscordRelay() {
    if (discordRelay) return;
    discordRelay = new DiscordRelay();
    discordRelay.connect();
    discordRelay.onEvent('chat', data => {
        // players' Discord messages land as a chat bubble + log line (no chat panel)
        handleChatBubble({ sender: data.sender, text: data.text, timestamp: data.timestamp, memberId: null });
        logMessage(data.sender + ': ' + data.text.slice(0, 140), null, data.sender);
    });
    const st = document.getElementById('discord-status');
    if (st) st.textContent = 'Discord relay: connecting…';
}

function startFloatingTextLoop() {
    setupDiscordRelay();
    let last = performance.now();
    function frame(now) {
        const delta = (now - last) / 1000;
        last = now;
        updateFloatingTexts(delta);
        renderFloatingTexts(game, document.getElementById('bubble-layer'));
        updateBubbles(delta);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

import { initAudio, playSound } from './audio.js?v=mvwq2xf0';
import { DICE, rollDice, onGameRoll } from './dice.js?v=mvwq2xf0';
import { castAbility } from './actions.js?v=mvwq2xf0';
import { ABILITIES, ensureAbilityState, spellCharges } from './abilities.js?v=mvwq2xf0';

function bindAudioControls() {
    initAudio();
}

function localOrSendAbility(slot) {
    castAbility(game, slot, logMessage, updateUI, broadcast);
}

function bindAbilityUI() {
    document.getElementById('ability-attack-btn')?.addEventListener('click', () => localOrSendAbility('attack'));
    document.getElementById('ability-spell-btn')?.addEventListener('click', () => localOrSendAbility('spell'));
    document.getElementById('ability-power-btn')?.addEventListener('click', () => localOrSendAbility('power'));
    document.addEventListener('keydown', event => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
        if (event.key === '1') localOrSendAbility('attack');
        if (event.key === '2') localOrSendAbility('spell');
        if (event.key === '3') localOrSendAbility('power');
    });
}

export function updateAbilityUI(game) {
    const member = activeMember(game);
    if (!member) return;
    const kit = ABILITIES[member.classKey];
    if (!kit) return;
    ensureAbilityState(member);
    const names = { attack: 'ability-attack-name', spell: 'ability-spell-name', power: 'ability-power-name' };
    for (const [slot, id] of Object.entries(names)) {
        const el = document.getElementById(id);
        if (el) el.textContent = kit[slot].name;
    }
    const spellBtn = document.getElementById('ability-spell-btn');
    const powerBtn = document.getElementById('ability-power-btn');
    const attackBtn = document.getElementById('ability-attack-btn');
    const canAct = member.hp > 0 && !game.gameOver && game.hasStarted !== false && !game.turnEnding;
    if (attackBtn) attackBtn.disabled = !canAct;
    if (spellBtn) spellBtn.disabled = !canAct || member.spellChargesLeft < 1;
    if (powerBtn) powerBtn.disabled = !canAct || member.powerCooldown > 0;
    const meta = document.getElementById('ability-meta');
    if (meta) meta.textContent = `Charges: ${member.spellChargesLeft}/${spellCharges(member)} | Power: ${member.powerCooldown > 0 ? member.powerCooldown + ' turn(s)' : 'ready'}`;
    for (const [slot, btnId] of [['attack', 'ability-attack-btn'], ['spell', 'ability-spell-btn'], ['power', 'ability-power-btn']]) {
        const btn = document.getElementById(btnId);
        if (btn) btn.title = kit[slot].description || `${kit[slot].name} (${kit[slot].dice[0]}d${kit[slot].dice[1]} + stat/level/item bonus)`;
    }
}

function appendDiceLog(text, cls = '') {
    const log = document.getElementById('dice-log');
    if (!log) return;
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = text;
    log.appendChild(line);
    while (log.children.length > 40) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
}

function bindDicePanel() {
    const countSel = document.getElementById('dice-count');
    if (countSel) {
        for (let i = 1; i <= 10; i++) {
            const option = document.createElement('option');
            option.textContent = String(i);
            countSel.appendChild(option);
        }
    }
    const doRoll = () => {
        const count = Number(document.getElementById('dice-count')?.value || 1);
        const type = document.getElementById('dice-type')?.value || 'd20';
        const mod = Number(document.getElementById('dice-mod')?.value || 0);
        const sides = DICE[type];
        const result = rollDice(count, sides, mod);
        const total = document.getElementById('dice-total');
        if (total) total.textContent = String(result.total);
        const crit = type === 'd20' && result.rolls.includes(20);
        const fail = type === 'd20' && result.rolls.includes(1);
        appendDiceLog(`You: ${count}${type} [${result.rolls.join(', ')}]${mod ? (mod > 0 ? ' +' : ' ') + mod : ''} = ${result.total}${crit ? ' CRIT!' : ''}${fail ? ' (nat 1)' : ''}`, crit ? 'dice-crit' : fail ? 'dice-fail' : '');
        playSound('treasure');
        logMessage(`rolls ${count}${type}${mod ? (mod > 0 ? '+' : '') + mod : ''}: [${result.rolls.join(', ')}] = ${result.total}${crit ? ' — natural 20!' : ''}${fail ? ' — natural 1!' : ''}`, activeMember(game));
                if (discordRelay?.isDm) {
            discordRelay.relayChat(`🎲 ${count}${type} = ${result.total}`, 'Dice');
        }
    };
    document.getElementById('dice-roll-btn')?.addEventListener('click', doRoll);
    const advRoll = dir => {
        const mod = Number(document.getElementById('dice-mod')?.value || 0);
        const a = rollDice(1, 20, 0).total, b = rollDice(1, 20, 0).total;
        const pick = dir > 0 ? Math.max(a, b) : Math.min(a, b);
        const total = document.getElementById('dice-total');
        if (total) total.textContent = String(pick + mod);
        appendDiceLog(`You: ${dir > 0 ? 'Adv' : 'Dis'} d20 [${a} & ${b}] \u2192 ${pick + mod}`);
        logMessage(`rolls ${dir > 0 ? 'advantage' : 'disadvantage'} d20 [${a} & ${b}] \u2192 ${pick + mod}.`, activeMember(game));
    };
    document.getElementById('dice-adv-btn')?.addEventListener('click', () => advRoll(1));
    document.getElementById('dice-dis-btn')?.addEventListener('click', () => advRoll(-1));

    // Game events (ability rolls) feed the dice log
    onGameRoll(detail => {
        appendDiceLog(`${detail.label}: ${detail.count}d${detail.sides} [${detail.rolls.join(', ')}]${detail.mod ? ' +' + detail.mod : ''} = ${detail.total}`);
        const total = document.getElementById('dice-total');
        if (total) total.textContent = String(detail.total);
    });
}

function showErrorBoundary(error) {
    console.error(error);
    const boundary = document.getElementById('error-boundary');
    const message = document.getElementById('error-message');
    if (boundary) boundary.style.display = 'flex';
    if (message) message.textContent = error?.message || 'An unexpected error occurred.';
}

function bindErrorBoundary() {
    document.getElementById('reset-from-error')?.addEventListener('click', () => {
        localStorage.removeItem(SAVE_STORAGE_KEY);
        location.reload();
    });
    window.addEventListener('error', event => showErrorBoundary(event.error));
    window.addEventListener('unhandledrejection', event => showErrorBoundary(event.reason));
}

window.addEventListener('DOMContentLoaded', () => {
    try {
        initGame();
        renderSavedLog();
        updateUI();
        bindInput(game, logMessage, updateUI, broadcast);
        bindGameUI();
        bindAbilityUI();
        bindDicePanel();
        populateSaveSlotSelect();
        bindAudioControls();
        bindErrorBoundary();
        startFloatingTextLoop();
        window.addEventListener('resize', () => {
            updateMapSizing();
            centerMapOnActiveMember(game);
        });
    } catch (error) {
        showErrorBoundary(error);
    }
});
