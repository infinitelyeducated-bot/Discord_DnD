import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:8080/crawler.html';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console error: ${msg.text()}`);
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const results = {};

results.title = await page.title();
results.mapRendered = await page.locator('#dungeon-map-content .map-cell').count() > 0;
results.turnOrder = await page.locator('#turn-order-bar .turn-order-item').count() > 0;
results.characterSheets = await page.locator('#character-sheet-list .character-sheet').count() === 6;
results.minimap = await page.locator('#minimap canvas').count() > 0;
results.inventorySection = await page.locator('#inventory-section').count() > 0;
results.chatSection = await page.locator('#chat-section').count() > 0;
results.networkDialog = await page.locator('#network-dialog').count() > 0;
results.errorBoundary = await page.locator('#error-boundary').count() > 0;
results.levelTitle = await page.locator('#level-title').textContent();

// Try moving a character
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
results.movementWorked = await page.locator('#game-log .log-entry').count() > 0;

// Try attack
await page.keyboard.press('f');
await page.waitForTimeout(500);

// Open pause menu
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
results.pauseMenuOpen = await page.locator('#escape-menu').isVisible();

// Screenshot
await page.screenshot({ path: process.argv[3] || 'smoke.png' });

await browser.close();

console.log(JSON.stringify({ results, errors }, null, 2));
if (errors.length) process.exit(1);
