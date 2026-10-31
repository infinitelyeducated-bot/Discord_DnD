// Function check of the real page: character sheet, every panel, and every action.
const { chromium } = require('playwright-core');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', d => d.accept());
    await page.goto('http://127.0.0.1:8080/crawler.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const r = {};
    const log = () => page.locator('#game-log').textContent();
    const card = () => page.locator('#character-sheet-list .character-sheet').first();

    // ---- character sheet ----
    r.sheets = await page.locator('#character-sheet-list .character-sheet').count();
    r.sheetHasAllParts = await card().evaluate(c => ['.sheet-name-input', '.sheet-level-badge', 'select[data-field=classKey]', '.sheet-ready-box', '.hp-bar', '.sheet-stats-row', '.attribute-allocation', '.sheet-status', '.sheet-remove-btn'].every(s => c.querySelector(s)));
    await card().locator('.sheet-name-input').fill('Testy');
    await card().locator('.sheet-name-input').press('Enter');
    await page.waitForTimeout(300);
    r.nameEdit = (await card().locator('.sheet-name-input').inputValue()) === 'Testy' && (await page.locator('#top-party-row').textContent()).includes('Testy');
    await card().locator('select[data-field=classKey]').selectOption('wizard');
    await page.waitForTimeout(300);
    r.classChange = (await card().locator('select[data-field=classKey]').inputValue()) === 'wizard' && (await log()).includes('changes class to Wizard');
    // starting points -> spend one on Int, reclaim with right-click
    await page.fill('#gm-starting-points', '3');
    await page.locator('#gm-starting-points').press('Tab');
    await page.waitForTimeout(300);
    r.pointsGiven = (await card().locator('.remaining-points').textContent()).trim() === '3 pt';
    const intBefore = Number(await card().locator('input[data-point-stat=intelligence]').inputValue());
    await card().locator('input[data-point-stat=intelligence]').click();
    await page.waitForTimeout(200);
    const intAfter = Number(await card().locator('input[data-point-stat=intelligence]').inputValue());
    r.spendPoint = intAfter === intBefore + 1 && (await card().locator('.remaining-points').textContent()).trim() === '2 pt';
    await card().locator('input[data-point-stat=intelligence]').click({ button: 'right' });
    await page.waitForTimeout(200);
    r.reclaimPoint = Number(await card().locator('input[data-point-stat=intelligence]').inputValue()) === intBefore;
    r.statsWhole = await page.evaluate(() => [...document.querySelectorAll('.attribute-allocation input')].every(i => Number.isInteger(Number(i.value))));
    // ready lock
    await card().locator('.sheet-ready-box').check();
    await page.waitForTimeout(300);
    r.readyLocks = (await card().locator('.sheet-name-input').isDisabled()) && (await card().locator('select[data-field=classKey]').isDisabled()) && (await card().textContent()).includes('READY');
    await card().locator('.sheet-ready-box').uncheck();
    await page.waitForTimeout(200);
    // remove
    const n0 = await page.locator('#character-sheet-list .character-sheet').count();
    await page.locator('#character-sheet-list .character-sheet').last().locator('.sheet-remove-btn').click();
    await page.waitForTimeout(300);
    r.removeSheet = (await page.locator('#character-sheet-list .character-sheet').count()) === n0 - 1;
    await page.selectOption('#add-member-class', 'archer');
    await page.click('#add-member-btn');
    await page.waitForTimeout(300);
    r.addArcher = (await page.locator('#character-sheet-list .character-sheet').count()) === n0 && (await page.locator('#character-sheet-list .character-sheet').last().locator('select[data-field=classKey]').inputValue()) === 'archer';
    r.hpBarsWhole = await page.evaluate(() => [...document.querySelectorAll('.hp-label')].every(l => /^\d+\/\d+ HP$/.test(l.textContent.trim())));
    r.activeHighlight = await page.evaluate(() => document.querySelectorAll('#character-sheet-list .character-sheet.active').length === 1);
    r.levelBadge = /^Lv \d+$/.test((await card().locator('.sheet-level-badge').textContent()).trim());

    // ---- actions / gameplay ----
    const explored0 = (await log()).match(/XP from exploring/g)?.length || 0;
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250);
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250);
    const t = await log();
    r.moveLogged = /moves (right|left) to/.test(t);
    const explored1 = (t.match(/XP from exploring/g) || []).length;
    r.exploreXpOnlyNewTiles = explored1 - explored0 <= 2 && explored1 - explored0 >= 1;
    r.gameLockedAfterStart = await card().locator('select[data-field=classKey]').isDisabled();
    r.movesCounter = /Mov\d+\/10/.test((await card().textContent()).replace(/\s/g, ''));
    r.abilityNamesForClass = (await page.locator('#ability-attack-name').textContent()) === 'Arcane Bolt';
    const logLenA = await page.locator('#game-log .log-entry').count();
    await page.keyboard.press('1'); await page.waitForTimeout(400);
    const abilityLines = await page.evaluate(n => [...document.querySelectorAll('#game-log .log-entry')].slice(n).map(e => e.textContent).join(' '), logLenA);
    r.abilityKeyResponds = /no enemy within|for \d+ damage/.test(abilityLines);
    // double End Turn must advance exactly one player (two clicks inside the lock window)
    const activeBefore = await page.evaluate(() => document.querySelector('#character-sheet-list .character-sheet.active .sheet-name-input').value);
    await page.evaluate(() => { const b = document.getElementById('end-turn-btn'); b.click(); setTimeout(() => b.click(), 120); });
    await page.waitForTimeout(1500);
    const order = await page.evaluate(() => [...document.querySelectorAll('#character-sheet-list .sheet-name-input')].map(i => i.value));
    const activeAfter = await page.evaluate(() => document.querySelector('#character-sheet-list .character-sheet.active .sheet-name-input').value);
    r.doubleEndTurnOnePlayer = order.indexOf(activeAfter) === (order.indexOf(activeBefore) + 1) % order.length;
    r.monsterPhaseLogged = (await log()).includes('Monster Phase');
    const restDisabledAtFullHp = await page.locator('#rest-btn').isDisabled();
    const fullHp = await page.evaluate(() => { const c = document.querySelector('#character-sheet-list .character-sheet.active .hp-label').textContent.trim(); const [a, b] = c.split('/'); return Number(a) === parseInt(b); });
    r.restDisabledOnlyAtFullHp = restDisabledAtFullHp === fullHp;
    if (!restDisabledAtFullHp) { await page.click('#rest-btn'); await page.waitForTimeout(1200); r.restWorks = /rests/.test(await log()); }
    r.guardButtonState = await page.locator('#guard-btn').isVisible();
    // dice
    await page.click('#dice-roll-btn'); await page.waitForTimeout(200);
    r.diceRoll = /^\d+$/.test((await page.locator('#dice-total').textContent()).trim()) && (await log()).includes('rolls 1d20');
    // chat
    await page.fill('#chat-input', 'hello'); await page.press('#chat-input', 'Enter'); await page.waitForTimeout(200);
    r.chat = (await page.locator('#chat-log').textContent()).includes('hello');
    // minimap / map / fullscreen
    r.minimap = await page.locator('#minimap canvas').isVisible();
    r.mapCells = (await page.locator('#dungeon-map-content .map-cell').count()) > 100;
    await page.click('#fullscreen-toggle'); await page.waitForTimeout(200);
    r.fullscreen = await page.evaluate(() => document.getElementById('map-column').classList.contains('fullscreen'));
    await page.click('#fullscreen-toggle');
    // pause menu: guide, save/load
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    r.pauseMenu = await page.locator('#escape-menu').evaluate(d => d.open);
    await page.click('#open-readme-button'); await page.waitForTimeout(300);
    r.guideOpens = await page.locator('#readme-dialog').evaluate(d => d.open);
    r.guideSaysExploring = (await page.locator('.readme-body').textContent()).includes('exploring');
    await page.click('#readme-close-top'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.click('#save-game-button'); await page.waitForTimeout(300);
    r.save = (await page.locator('#save-status').textContent()).includes('Saved');
    const hpBeforeLoad = await page.evaluate(() => document.querySelector('.hp-label').textContent);
    await page.click('#load-game-button'); await page.waitForTimeout(600);
    const loadStatus = await page.locator('#save-status').textContent();
    const hpAfterLoad = await page.evaluate(() => document.querySelector('.hp-label').textContent);
    r.load = loadStatus.includes('Loaded') && hpAfterLoad === hpBeforeLoad;
    if (!r.load) r.loadDetail = { loadStatus, hpBeforeLoad, hpAfterLoad };
    r.notStuckAfterLoad = await page.evaluate(() => !document.getElementById('end-turn-btn').disabled);
    if (await page.locator('#escape-menu').evaluate(d => d.open)) await page.keyboard.press('Escape');
    // network dialog
    await page.click('#network-button'); await page.waitForTimeout(200);
    r.networkDialog = await page.locator('#network-dialog').evaluate(d => d.open);
    await page.click('#network-cancel');
    // layout sanity: no overlapping panels
    r.noOverlap = await page.evaluate(() => {
        const b = s => document.querySelector(s).getBoundingClientRect();
        const boxes = ['#map-column', '#chat-section', '.game-log-section', '.side-column'].map(b);
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], c = boxes[j]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) return false; }
        return true;
    });
    r.sheetsOneRow = await page.evaluate(() => new Set([...document.querySelectorAll('#character-sheet-list .character-sheet')].map(c => Math.round(c.getBoundingClientRect().top))).size === 1);

    r.consoleErrors = errors;
    const failed = Object.entries(r).filter(([k, v]) => v === false || (Array.isArray(v) && v.length));
    console.log(JSON.stringify(r, null, 2));
    console.log('\nFAILED:', failed.length ? failed.map(f => f[0]).join(', ') : 'none');
    await browser.close();
})();
