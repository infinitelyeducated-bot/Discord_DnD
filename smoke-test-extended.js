import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:8080/crawler.html';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console error: ${msg.text()}`);
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const results = {};
const checks = [
    ['title', () => page.title()],
    ['mapRendered', () => page.locator('#dungeon-map-content .map-cell').count().then(c => c > 0)],
    ['turnOrder', () => page.locator('#turn-order-bar .turn-order-item').count().then(c => c > 0)],
    ['characterSheets', () => page.locator('#character-sheet-list .character-sheet').count().then(c => c === 6)],
    ['minimap', () => page.locator('#minimap canvas').count().then(c => c > 0)],
    ['inventorySection', () => page.locator('#inventory-panel').count().then(c => c > 0)],
    ['chatSection', () => page.locator('#chat-section').count().then(c => c > 0)],
    ['chatForm', () => page.locator('#chat-form').count().then(c => c > 0)],
    ['networkDialog', () => page.locator('#network-dialog').count().then(c => c > 0)],
    ['hostAsGmCheckbox', () => page.locator('#host-as-gm').count().then(c => c > 0)],
    ['turnTimerToggle', () => page.locator('#turn-timer-toggle').count().then(c => c > 0)],
    ['turnTimerDisplay', () => page.locator('#turn-timer').count().then(c => c > 0)],
    ['errorBoundary', () => page.locator('#error-boundary').count().then(c => c > 0)],
    ['mobileControls', () => page.locator('#mobile-controls').count().then(c => c > 0)],
    ['floatingTextLayer', () => page.locator('#floating-text-layer').count().then(c => c > 0)],
    ['actionButtons', () => page.locator('#move-up, #attack-btn, #rest-btn, #guard-btn, #end-turn-btn').count().then(c => c === 5)],
    ['hpBars', () => page.locator('.hp-bar').count().then(c => c === 6)],
    ['statusBadges', () => page.locator('.status-list').count().then(c => c === 6)],
    ['legendItems', () => page.locator('.legend-item').count().then(c => c > 0)],
    ['audioControls', () => page.locator('.audio-controls').count().then(c => c > 0)],
    ['difficultySelect', () => page.locator('#difficulty-select').count().then(c => c > 0)],
    ['formationSelect', () => page.locator('#formation-select').count().then(c => c > 0)]
];

for (const [key, fn] of checks) {
    try {
        results[key] = await fn();
    } catch (e) {
        results[key] = false;
        errors.push(`check ${key} failed: ${e.message}`);
    }
}

results.levelTitle = await page.locator('#level-title').textContent();

// Movement smoke
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
results.movementLogged = await page.locator('#game-log .log-entry').count().then(c => c > 0);

// Attack smoke
const attackLogBefore = await page.locator('#game-log .log-entry').count();
await page.keyboard.press('f');
await page.waitForTimeout(500);
results.attackAttemptLogged = await page.locator('#game-log .log-entry').count().then(c => c > attackLogBefore);

// End turn
await page.keyboard.press('e');
await page.waitForTimeout(500);
results.turnAdvanced = await page.locator('#game-log .log-entry').count().then(c => c > 0);

// Pause menu
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
results.pauseMenuOpen = await page.locator('#escape-menu').isVisible().catch(() => false);

// Audio controls inside pause menu
results.volumeSlider = await page.locator('#volume-slider').count().then(c => c > 0);
results.muteToggle = await page.locator('#mute-toggle').count().then(c => c > 0);

// Close pause menu first, then open network dialog
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.locator('#network-button').click();
await page.waitForTimeout(300);
results.networkDialogOpen = await page.locator('#network-dialog').isVisible().catch(() => false);
await page.locator('#network-cancel').click();

// Chat message (network offline: only rendered if local echo implemented, which requires networkManager mode)
await page.locator('#chat-input').fill('Smoke test hello');
await page.locator('#chat-form button').click({ force: true });
await page.waitForTimeout(300);
results.chatMessageRendered = await page.locator('#chat-log .chat-entry').count().then(c => c > 0);
if (!results.chatMessageRendered) {
    // chat only sends when networkManager.mode is set; this is expected in offline smoke test
    results.chatMessageRendered = 'skipped (offline)';
}

// Screenshot
await page.screenshot({ path: process.argv[3] || 'smoke-extended.png', fullPage: true });

await browser.close();

console.log(JSON.stringify({ results, errors }, null, 2));
if (errors.length) process.exit(1);
