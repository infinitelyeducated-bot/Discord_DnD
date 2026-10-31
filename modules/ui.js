import { MAX_PARTY_SIZE, CLASSES, MAX_CHARACTER_LEVEL, PLAYER_COLORS, PLAYER_MARKERS, BIOMES } from './config.js?v=mvvrqkfn';
import { activeMember } from './state.js?v=mvvrqkfn';
import { adjacentDeadPartyMembers, updateDerivedStats, setMovementAllowance, experienceRequired } from './party.js?v=mvvrqkfn';
import { positionKey } from './utils.js?v=mvvrqkfn';
import { nearestAttackTarget } from './combat.js?v=mvvrqkfn';
import { isWalkable, updateExplored, getBiome, getItemAt, isShrineAt } from './map.js?v=mvvrqkfn';
import { pathDistanceWithin } from './pathfinding.js?v=mvvrqkfn';
import { hasStatusEffect } from './party.js?v=mvvrqkfn';

const CLASS_AVATARS = {
    fighter: '⚔',
    archer: '🏹',
    rogue: '🗡',
    wizard: '🔮',
    cleric: '✚'
};

const floatingTexts = [];

export function addFloatingText(x, y, text, color = '#fff') {
    floatingTexts.push({ x, y, text, color, life: 1.0, maxLife: 1.0 });
}

export function renderFloatingTexts(game, container) {
    const viewport = document.getElementById('dungeon-map');
    if (!viewport || !container) return;
    container.replaceChildren();
    const fontSize = parseFloat(viewport.style.fontSize) || 10;
    for (const ft of floatingTexts) {
        const cell = document.querySelector(`#dungeon-map-content .map-cell[data-x="${ft.x}"][data-y="${ft.y}"]`);
        if (!cell) continue;
        const cellRect = cell.getBoundingClientRect();
        const viewRect = viewport.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = 'floating-text';
        el.textContent = ft.text;
        el.style.left = `${cellRect.left - viewRect.left + viewport.scrollLeft + fontSize / 2}px`;
        el.style.top = `${cellRect.top - viewRect.top + viewport.scrollTop - fontSize}px`;
        el.style.color = ft.color;
        el.style.opacity = ft.life / ft.maxLife;
        container.appendChild(el);
    }
}

export function updateFloatingTexts(deltaTime) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].life -= deltaTime;
        floatingTexts[i].y -= deltaTime * 0.5;
        if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }
}

export function renderTurnOrder(game, container) {
    if (!container) return;
    container.replaceChildren();
    const active = activeMember(game);
    const living = game.party.filter(m => m.hp > 0);
    if (!living.length) return;

    const activeIndex = living.findIndex(m => m.id === active?.id);
    const ordered = [];
    for (let i = 0; i < living.length; i++) {
        const idx = (activeIndex + i) % living.length;
        ordered.push(living[idx]);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'turn-order-bar';
    for (const member of ordered) {
        const item = document.createElement('div');
        item.className = `turn-order-item ${member === active ? 'active' : ''}`;
        item.style.borderColor = member.color;
        item.style.color = member.color;
        item.innerHTML = `<span class="turn-avatar">${CLASS_AVATARS[member.classKey] || '•'}</span><span class="turn-name">${member.name}</span>`;
        item.title = `${member.name} (${member.className}) ${member === active ? '— ACTIVE' : ''}`;
        wrapper.appendChild(item);
    }
    container.appendChild(wrapper);
}

export function renderTopPartyRow(game, container) {
    if (!container) return;
    container.replaceChildren();
    const active = activeMember(game);
    for (const member of game.party) {
        const item = document.createElement('div');
        item.className = `top-party-item ${member === active ? 'active' : ''}`;
        item.style.color = member.color;
        item.innerHTML = `<span class="top-party-avatar">${CLASS_AVATARS[member.classKey] || '•'}</span><span class="top-party-name">${member.name}</span>`;
        item.title = `${member.name} (${member.className}) ${member === active ? '— ACTIVE' : ''}`;
        container.appendChild(item);
    }
}

export function renderMap(game, mapContent) {
    const fragment = document.createDocumentFragment();
    const active = activeMember(game);
    const membersByPosition = new Map();
    const sightSet = computeSightSet(game, active);
    const explored = game.explored?.[active?.dungeonLevel || 1] || [];
    const reachable = active?.movesRemaining > 0 ? computeReachableTiles(game, active) : new Set();

    for (const partyMember of game.party) {
        if (partyMember.dungeonLevel !== active?.dungeonLevel || !partyMember.position) continue;
        const key = positionKey(partyMember.position.x, partyMember.position.y);
        if (!membersByPosition.has(key)) membersByPosition.set(key, []);
        membersByPosition.get(key).push(partyMember);
    }

    for (let y = 0; y < game.mapHeight; y++) {
        const row = document.createElement('div');
        row.className = 'map-row';
        for (let x = 0; x < game.mapWidth; x++) {
            const key = positionKey(x, y);
            const visible = sightSet.has(key);
            const wasExplored = explored[y]?.[x];
            const cellElement = document.createElement('span');
            cellElement.className = 'map-cell';
            cellElement.dataset.x = String(x);
            cellElement.dataset.y = String(y);
            if (reachable.has(key)) cellElement.classList.add('reachable-tile');

            if (!visible && !wasExplored) {
                cellElement.textContent = ' ';
                cellElement.style.color = 'transparent';
            } else {
                const membersHere = membersByPosition.get(key) || [];
                const member = membersHere.find(p => p === active) || membersHere[0];
                const baseCell = game.map[y][x];
                const cell = member
                    ? (baseCell === 'S' ? 'S' : member.marker)
                    : baseCell;
                cellElement.textContent = cell;
                styleCell(game, cellElement, x, y, cell, member, membersHere, active, visible);
            }
            row.appendChild(cellElement);
        }
        fragment.appendChild(row);
    }
    mapContent.replaceChildren(fragment);
}

function computeReachableTiles(game, member) {
    const reachable = new Set();
    if (!member?.position || member.movesRemaining <= 0) return reachable;
    const queue = [{ x: member.position.x, y: member.position.y, distance: 0 }];
    reachable.add(positionKey(member.position.x, member.position.y));
    for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        if (current.distance >= member.movesRemaining) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = current.x + dx;
            const y = current.y + dy;
            const key = positionKey(x, y);
            if (reachable.has(key)) continue;
            if (!isWalkable(game, x, y)) continue;
            reachable.add(key);
            queue.push({ x, y, distance: current.distance + 1 });
        }
    }
    return reachable;
}

function computeSightSet(game, active) {
    const set = new Set();
    if (!active?.position) return set;
    const radius = 5;
    for (const member of game.party) {
        if (member.dungeonLevel !== active.dungeonLevel || member.hp <= 0 || !member.position) continue;
        for (let y = Math.max(0, member.position.y - radius); y <= Math.min(game.mapHeight - 1, member.position.y + radius); y++) {
            for (let x = Math.max(0, member.position.x - radius); x <= Math.min(game.mapWidth - 1, member.position.x + radius); x++) {
                if (Math.abs(x - member.position.x) + Math.abs(y - member.position.y) <= radius) {
                    set.add(positionKey(x, y));
                }
            }
        }
    }
    return set;
}

function styleCell(game, cellElement, x, y, cell, member, membersHere, active, visible) {
    const biome = game.biome || getBiome(active?.dungeonLevel || 1);
    const dim = !visible;
    if (member) {
        cellElement.style.color = member.color;
        cellElement.style.fontWeight = 'bold';
        const stackedNames = membersHere.map(p => p.name).join(', ');
        cellElement.title = `${game.map[y][x] === 'S' ? 'Starting position: ' : ''}${stackedNames}`;
        cellElement.setAttribute('aria-label', cellElement.title);
        if (member === active) cellElement.classList.add('active-player');
    } else if (cell === '#') {
        cellElement.textContent = biome.wallChar;
        cellElement.style.color = dim ? '#333' : biome.wallColor;
    } else if (cell === 'S') {
        cellElement.style.color = dim ? '#004d55' : '#00e5ff';
        cellElement.title = 'Starting position';
    } else if (cell === 'M') {
        cellElement.style.color = dim ? '#4a1a1a' : '#ef5350';
        const monster = game.monsters[positionKey(x, y)];
        if (monster) {
            cellElement.title = buildMonsterTooltip(monster);
            if (visible) {
                cellElement.classList.add('monster-cell');
                const indicator = document.createElement('span');
                indicator.className = 'monster-health-indicator';
                indicator.innerHTML = `<span class="monster-health-label">${Math.ceil(monster.hp)}/${monster.maxHp}</span>` +
                    `<span class="monster-health-track"><span class="monster-health-fill" style="width:${Math.max(0, monster.hp / monster.maxHp * 100)}%"></span></span>`;
                cellElement.appendChild(indicator);
            }
        }
    } else if (game.treasures[positionKey(x, y)]) {
        const treasure = game.treasures[positionKey(x, y)];
        cellElement.style.color = dim ? '#4a4a1a' : (treasure.type === 'power' ? '#ffeb3b' : '#ffd740');
        cellElement.title = treasure.type === 'power'
            ? 'Power Item (+5 damage, +60 XP)'
            : `${treasure.name}: ${treasure.value} treasure`;
    } else if (cell === '^') {
        cellElement.style.color = dim ? '#4a1a0a' : '#ff7043';
        cellElement.title = 'Trap — step here to trigger';
    } else if (cell === '>') {
        cellElement.style.color = dim ? '#0a3a22' : '#69f0ae';
        cellElement.title = 'Exit to next level';
    } else if (cell === '+') {
        cellElement.style.color = dim ? '#333' : '#d4a373';
        cellElement.title = 'Closed door (move into it to open)';
    } else if (cell === '≡') {
        cellElement.style.color = dim ? '#1a1a1a' : '#555';
        cellElement.title = 'Chasm — impassable';
    } else if (cell === '~') {
        cellElement.style.color = dim ? '#0a1a2a' : '#4a90a4';
        cellElement.title = 'Water — impassable';
    } else if (cell === 'Θ') {
        cellElement.style.color = dim ? '#1a2a1a' : '#69f0ae';
        cellElement.title = 'Shrine — step here to revive a fallen ally';
    } else if (cell === '.') {
        cellElement.textContent = biome.floorChar;
        cellElement.style.color = dim ? '#222' : biome.floorColor;
    } else {
        cellElement.style.color = dim ? '#222' : '#888';
    }
}

function buildMonsterTooltip(monster) {
    const hpBar = '█'.repeat(Math.ceil(monster.hp / monster.maxHp * 10)).padEnd(10, '░');
    return `${monster.name}\n${hpBar} ${Math.ceil(monster.hp)}/${monster.maxHp} HP\nAttack: ${monster.attack}`;
}

export function renderMinimap(game, container) {
    if (!container) return;
    container.replaceChildren();
    const active = activeMember(game);
    const explored = game.explored?.[active?.dungeonLevel || 1] || [];
    const scaleX = Math.max(1, Math.floor(game.mapWidth / 40));
    const scaleY = Math.max(1, Math.floor(game.mapHeight / 30));
    const miniWidth = Math.ceil(game.mapWidth / scaleX);
    const miniHeight = Math.ceil(game.mapHeight / scaleY);
    const canvas = document.createElement('canvas');
    canvas.width = miniWidth;
    canvas.height = miniHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, miniWidth, miniHeight);

    for (let my = 0; my < miniHeight; my++) {
        for (let mx = 0; mx < miniWidth; mx++) {
            const gx = mx * scaleX;
            const gy = my * scaleY;
            if (!explored[gy]?.[gx]) continue;
            const cell = game.map[gy]?.[gx];
            if (cell === '#') ctx.fillStyle = '#555';
            else if (cell === '>') ctx.fillStyle = '#69f0ae';
            else if (cell === '^' || cell === '≡') ctx.fillStyle = '#ff7043';
            else ctx.fillStyle = '#333';
            ctx.fillRect(mx, my, 1, 1);
        }
    }

    for (const partyMember of game.party) {
        if (partyMember.dungeonLevel !== active?.dungeonLevel || !partyMember.position) continue;
        const mx = Math.floor(partyMember.position.x / scaleX);
        const my = Math.floor(partyMember.position.y / scaleY);
        ctx.fillStyle = partyMember.color;
        ctx.fillRect(mx, my, 1, 1);
    }

    container.appendChild(canvas);
}

export function renderLegend(game, container) {
    container.replaceChildren();
    for (const partyMember of game.party) {
        const marker = document.createElement('span');
        marker.className = 'player-legend-marker';
        marker.textContent = partyMember.marker;
        marker.style.color = partyMember.color;
        marker.title = partyMember.name;
        marker.setAttribute('aria-label', partyMember.name);
        container.appendChild(marker);
    }
}

export function setActionAvailability(id, available, active = false) {
    const button = document.getElementById(id);
    if (!button) return;
    button.disabled = !available;
    button.classList.toggle('guard-active', active);
    button.setAttribute('aria-pressed', String(active));
}

export function updateActionButtons(game) {
    const member = activeMember(game);
    const canAct = Boolean(member && member.hp > 0 && !game.gameOver && !game.turnEnding);
    for (const direction of ['up', 'left', 'down', 'right']) {
        setActionAvailability(`move-${direction}`, canAct && canMove(game, member, direction));
    }
    setActionAvailability('attack-btn', canAct && Boolean(nearestAttackTarget(game, member)));
    setActionAvailability('rest-btn', canAct && member.hp < member.maxHp);
    const canRevive = canAct && member.classKey === 'cleric' &&
        member.movesRemaining >= 3 && adjacentDeadPartyMembers(game, member).length > 0;
    const canGuard = canAct && !member.guardActive &&
        (canRevive || (member.hp === member.maxHp && member.movesRemaining >= 2));
    setActionAvailability('guard-btn', canGuard, canAct && member.guardActive);
    setActionAvailability('end-turn-btn', canAct);
    document.getElementById('remove-member-btn').disabled = game.party.length <= 1 || game.hasStarted;
    document.getElementById('add-member-btn').disabled = game.party.length >= MAX_PARTY_SIZE || game.hasStarted;
    document.getElementById('gm-starting-points').disabled = game.hasStarted;
}

function canMove(game, member, direction) {
    if (!member || member.hp <= 0 || member.movesRemaining <= 0 || game.gameOver) return false;
    const offsets = { up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, right: { x: 1, y: 0 } };
    const offset = offsets[direction];
    return isWalkable(game, member.position.x + offset.x, member.position.y + offset.y);
}

export function renderCharacterSheets(game, container) {
    container.replaceChildren();
    game.party.forEach((member, index) => {
        const card = buildCharacterSheet(game, member, index);
        container.appendChild(card);
    });
}

const STATUS_BORDER_COLORS = {
    poison: '#76ff03',
    stun: '#ff5252',
    bless: '#ffd740',
    haste: '#69f0ae',
    slow: '#ff9100'
};

function buildCharacterSheet(game, member, index) {
    const card = document.createElement('article');
    card.className = `character-sheet ${member === activeMember(game) ? 'active' : ''}`;
    card.dataset.memberId = String(member.id);
    card.style.setProperty('--member-color', member.color);
    const activeStatus = member.statusEffects?.find(e => e.type in STATUS_BORDER_COLORS);
    if (member === activeMember(game) && activeStatus) {
        card.style.outlineColor = STATUS_BORDER_COLORS[activeStatus.type];
        card.style.borderColor = STATUS_BORDER_COLORS[activeStatus.type];
    }

    // Name on its own line at the top, editable until locked/started
    const nameRow = document.createElement('div');
    nameRow.className = 'sheet-name-row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'sheet-name-input';
    nameInput.value = member.name;
    nameInput.maxLength = 24;
    nameInput.dataset.memberId = String(member.id);
    nameInput.dataset.field = 'name';
    nameInput.disabled = game.hasStarted || member.ready === true;
    nameInput.style.color = member.color;
    nameInput.setAttribute('aria-label', 'Character name');
    nameRow.appendChild(nameInput);

    const header = document.createElement('div');
    header.className = 'sheet-heading-row';

    const avatar = document.createElement('span');
    avatar.className = 'sheet-avatar';
    avatar.textContent = CLASS_AVATARS[member.classKey] || '•';
    avatar.style.color = member.color;

    const heading = document.createElement('h3');
    heading.innerHTML = `${member.marker} ${index + 1}.${member.hp <= 0 ? ' <span class="down-tag">(down)</span>' : ''}`;
    heading.style.color = member.color;

    const title = document.createElement('div');
    title.className = 'sheet-title';
    title.appendChild(avatar);
    title.appendChild(heading);
    header.appendChild(title);

    const levelBadge = document.createElement('span');
    levelBadge.className = 'sheet-level-badge';
    levelBadge.textContent = `Lv ${member.level}`;
    levelBadge.title = `Character level ${member.level}`;
    header.appendChild(levelBadge);

    const subRow = document.createElement('div');
    subRow.className = 'sheet-sub-row';
    if (member === activeMember(game)) {
        const activeTag = document.createElement('span');
        activeTag.className = 'sheet-active-tag';
        activeTag.textContent = 'ACTIVE';
        subRow.appendChild(activeTag);
    }

    const classPoints = document.createElement('div');
    classPoints.className = 'sheet-class-points';
    const classSelect = document.createElement('select');
    classSelect.dataset.memberId = String(member.id);
    classSelect.dataset.field = 'classKey';
    classSelect.disabled = game.hasStarted || member.ready === true;
    classSelect.setAttribute('aria-label', 'Class');
    for (const [classKey, characterClass] of Object.entries(CLASSES)) {
        const option = document.createElement('option');
        option.value = classKey;
        option.textContent = characterClass.name;
        option.selected = member.classKey === classKey;
        classSelect.appendChild(option);
    }
    const readyLabel = document.createElement('label');
    readyLabel.className = 'sheet-ready-label';
    readyLabel.title = 'Lock in this player: name, class and points become final. In network games the host can start once every player is ready.';
    const readyBox = document.createElement('input');
    readyBox.type = 'checkbox';
    readyBox.className = 'sheet-ready-box';
    readyBox.dataset.readyMemberId = String(member.id);
    readyBox.checked = member.ready === true;
    readyBox.disabled = game.hasStarted;
    readyLabel.append(readyBox, document.createTextNode(member.ready ? ' READY' : ' Ready?'));
    if (member.ready) readyLabel.classList.add('is-ready');
    const remainingPoints = document.createElement('span');
    remainingPoints.className = 'remaining-points';
    remainingPoints.textContent = `${member.pendingAttributePoints} pt`;
    remainingPoints.title = 'Unspent attribution points';
    classPoints.append(classSelect, readyLabel, remainingPoints);
    subRow.appendChild(classPoints);

    const hpBar = document.createElement('div');
    hpBar.className = 'hp-bar';
    const hpFill = document.createElement('div');
    hpFill.className = 'hp-fill';
    const hpPercent = Math.max(0, Math.min(100, (member.hp / member.maxHp) * 100));
    hpFill.style.width = `${hpPercent}%`;
    hpFill.style.background = hpPercent > 60 ? '#4caf50' : hpPercent > 30 ? '#ffbd3d' : '#f44336';
    hpBar.appendChild(hpFill);
    const hpLabel = document.createElement('span');
    hpLabel.className = 'hp-label';
    hpLabel.textContent = `${member.hp}/${member.maxHp} HP`;
    hpBar.appendChild(hpLabel);

    const statusList = document.createElement('div');
    statusList.className = 'status-list';
    if (member.statusEffects?.length) {
        for (const effect of member.statusEffects) {
            const badge = document.createElement('span');
            badge.className = `status-badge status-${effect.type}`;
            badge.textContent = `${effect.type.toUpperCase()} ${effect.duration}`;
            statusList.appendChild(badge);
        }
    }

    const statsRow = document.createElement('div');
    statsRow.className = 'sheet-stats-row';
    const stat = (label, value) => {
        const div = document.createElement('div');
        div.className = 'sheet-stat';
        div.innerHTML = `<span class="sheet-stat-label">${label}</span><span class="sheet-stat-value">${value}</span>`;
        return div;
    };
    statsRow.append(
        stat('AC', member.armorClass),
        stat('Atk', member.attack),
        stat('Def', member.defense),
        stat('XP', `${member.xp}/${experienceRequired(member, game.party.length)}`),
        stat('Mov', `${member.movesRemaining}/${member.movesPerTurn}`),
        stat('DLv', member.dungeonLevel),
        stat('Treasure', member.treasure),
        stat('Items', member.powerItems)
    );

    const attributes = document.createElement('div');
    attributes.className = 'attribute-allocation';
    for (const [key, label, baseValue] of [
        ['initiative', 'Init', 0],
        ['dexterity', 'Dex', 10],
        ['intelligence', 'Int', 10],
        ['strength', 'Str', 10],
        ['constitution', 'Con', 10],
        ['wisdom', 'Wis', 10]
    ]) {
        const fieldLabel = document.createElement('label');
        fieldLabel.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(baseValue);
        input.max = '99';
        input.step = '1';
        input.value = String(member[key]);
        input.dataset.memberId = String(member.id);
        input.dataset.pointStat = key;
        input.readOnly = true;
        input.className = 'attribute-point-control';
        input.setAttribute('aria-label', `${label}: ${member[key]}. Left-click to add one point, right-click to subtract one.`);
        input.title = 'Left-click to add a point; right-click to subtract a point.';
        input.disabled = member.pendingAttributePoints <= 0 && member[key] <= baseValue;
        fieldLabel.appendChild(input);
        attributes.appendChild(fieldLabel);
    }

    const summary = document.createElement('p');
    summary.className = 'sheet-status';
    summary.textContent = `${member.pendingAttributePoints} point(s) available. Left-click a stat to spend one; right-click to reclaim one.`;

    const removeRow = document.createElement('div');
    removeRow.className = 'sheet-remove-row';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'sheet-remove-btn';
    removeBtn.textContent = '× Remove';
    removeBtn.title = member.hp <= 0
        ? 'Remove this fallen character from the party'
        : 'Remove this character (left the game)';
    removeBtn.dataset.removeMemberId = String(member.id);
    removeBtn.disabled = game.hasStarted && member.hp > 0;
    removeRow.appendChild(removeBtn);

    card.append(nameRow, header, subRow, hpBar, statusList, statsRow, attributes, summary, removeRow);
    return card;
}

function buildStatusTooltip(member) {
    if (!member.statusEffects?.length) return 'No status effects';
    return member.statusEffects.map(e => `${e.type} (${e.duration} turns)`).join(', ');
}

export function updateMapSizing() {
    const mapViewport = document.getElementById('dungeon-map');
    const mapContent = document.getElementById('dungeon-map-content');
    if (!mapViewport || !mapContent) return;
    const fontSize = Math.max(6, Math.min(9, mapViewport.clientWidth / 32));
    mapViewport.style.fontSize = `${fontSize}px`;
    mapContent.style.padding = `${mapViewport.clientHeight / 2}px ${mapViewport.clientWidth / 2}px`;
}

export function centerMapOnActiveMember(game) {
    const member = activeMember(game);
    if (!member?.position) return;
    const viewport = document.getElementById('dungeon-map');
    const cell = document.querySelector(
        `#dungeon-map-content .map-cell[data-x="${member.position.x}"][data-y="${member.position.y}"]`
    );
    if (!cell || !viewport) return;
    const viewportRect = viewport.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const targetLeft = cellRect.left + cellRect.width / 2 - (viewportRect.left + viewport.clientWidth / 2);
    const targetTop = cellRect.top + cellRect.height / 2 - (viewportRect.top + viewport.clientHeight / 2);
    viewport.scrollTo({
        left: viewport.scrollLeft + targetLeft,
        top: viewport.scrollTop + targetTop,
        behavior: 'smooth'
    });
}
