const fs = require('fs');
let s = fs.readFileSync('modules/combat.js','utf8').replace(/\r\n/g,'\n');

const oldActivate = s.indexOf('async function activateMonsterAI(');
const oldEnd = s.indexOf('function moveMonsterToward(');
if (oldActivate<0 || oldEnd<0 || oldEnd<oldActivate) { console.error('range', oldActivate, oldEnd); process.exit(1); }
const prefix = s.slice(0, oldActivate);
const suffix = s.slice(oldEnd);

const neu = `async function activateMonsterAI(game, member, logMessage, updateUI, broadcast) {
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
            addFloatingText(pos.x, pos.y, \`-\${tick} ☠\`, '#76ff03');
            logMessage(\`\${m.name} takes \${tick} poison damage\${m.poisoned ? \` (\${m.poisoned} turn(s) left)\` : ' and the poison wears off'}.\`, null, m.name);
            if (m.hp <= 0) {
                delete game.monsters[positionKey(pos.x, pos.y)];
                game.map[pos.y][pos.x] = '.';
                logMessage(\`\${m.name} succumbs to poison!\`, null, m.name);
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
                logMessage(\`\${m.name} is pinned and cannot act\${m.slowed ? '' : '; it shakes the arrow loose'}.\`, null, m.name);
                if (updateUI) { updateUI(); if (broadcast) broadcast({ type: 'sync', game }); await delay(250); }
                continue;
            }
            if (!m.slowed) logMessage(\`\${m.name} is no longer pinned.\`, null, m.name);
        }

        // — First strike — every character rolls 1-in-20 to attack first when a
        //   monster is adjacent; rogue rolls 1-in-5 with +5 damage.
        if (distTo(pos, member) <= 1) {
            const rogue = member.classKey === 'rogue';
            const chance = rogue ? 0.2 : 0.05;
            if (Math.random() < chance) {
                const bonus = rogue ? 5 : 0;
                const dmg = Math.max(1, member.attack + bonus + Math.floor(Math.random() * 3));
                m.hp = Math.max(0, m.hp - dmg);
                logMessage(\`\${member.name} \${rogue ? 'springs first and strikes' : 'gets the first strike'} \${m.name} for \${dmg} damage — no damage taken!\`, member);
                if (m.hp <= 0) {
                    delete game.monsters[positionKey(pos.x, pos.y)];
                    game.map[pos.y][pos.x] = '.';
                    const xp = killExperience(member, game);
                    gainExperience(member, xp, 'defeating a monster', game, logMessage);
                    logMessage(\`\${member.name} defeats \${m.name} and gains \${xp} XP.\`, member);
                }
                acted = true;
                if (updateUI) { updateUI(); if (broadcast) broadcast({ type: 'sync', game }); await delay(250); }
                continue;
            }
            // fail → monster attacks (its stats)
            const guardedByParty = Math.min(3, adjacentPartyMembers(game, member).length);
            const damage = Math.max(1, m.attack - member.defense - guardedByParty + Math.floor(Math.random() * 2));
            member.hp = Math.max(0, member.hp - damage);
            addFloatingText(member.position.x, member.position.y, \`-\${damage}\`, '#ff7043');
            playSound('hit');
            logMessage(\`\${member.name} fails the first-strike roll; \${m.name} attacks for \${damage} damage.\`, member);
            applyMonsterOnHitEffect(m, member, logMessage);
            if (member.hp === 0) { downMember(game, member, logMessage); }
            acted = true;
            if (updateUI) { updateUI(); if (broadcast) broadcast({ type: 'sync', game }); await delay(250); }
            continue;
        }

        // — Move 1–3 squares toward a player (small steps per monster turn) —
        const steps = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < steps; i++) {
            if (distTo(pos, member) <= 1) break;
            moveMonsterToward(game, pos, member.position);
            if (distTo(pos, member) <= 1) {
                logMessage(\`\${m.name} closes in on \${member.name}.\`, null, m.name);
                break;
            }
        }
        if (distTo(pos, member) <= 1) {
            const guardedByParty = Math.min(3, adjacentPartyMembers(game, member).length);
            const damage = Math.max(1, m.attack - member.defense - guardedByParty + Math.floor(Math.random() * 2));
            member.hp = Math.max(0, member.hp - damage);
            addFloatingText(member.position.x, member.position.y, \`-\${damage}\`, '#ff7043');
            playSound('hit');
            logMessage(\`\${m.name} attacks \${member.name} for \${damage} damage.\`, null, m.name);
            applyMonsterOnHitEffect(m, member, logMessage);
            if (member.hp === 0) { downMember(game, member, logMessage); }
            acted = true;
        }
        if (acted && updateUI) { updateUI(); if (broadcast) broadcast({ type: 'sync', game }); await delay(250); }
    }
}

function distTo(pos, member) {
    return Math.abs(pos.x - member.position.x) + Math.abs(pos.y - member.position.y);
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

`;

s = prefix + neu + suffix;
fs.writeFileSync('modules/combat.js', s);
console.log('combat.js rewritten');
