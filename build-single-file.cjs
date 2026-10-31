// Builds the single-file edition: Ascii_Dungeon_Crawler.html
// - every module inlined as one <script type="module"> (runs from file://)
// - the only UI removed is networking (Network button, dialog, status lines,
//   multiplayer guide section). Everything else, including party chat and the
//   turn timer, is untouched.
// Usage: node build-single-file.cjs [outDir]
const fs = require('fs');
const path = require('path');

const src = __dirname;
const outDir = process.argv[2] || path.join(src, '..', 'Ascii_Dungeon_Crawler');
const modDir = path.join(src, 'modules');

// ---- 1. embed modules as an import map of data: URLs ----
// Each module stays a real ES module (live bindings, cycles, top-level await
// all keep working). The browser loads them from data: URLs listed in an
// import map, which is allowed from file:// because no network fetch happens.
const files = fs.readdirSync(modDir).filter(f => f.endsWith('.js'));
const strip = s => s.replace(/(from\s*['"]\.\/[\w-]+\.js)\?v=[^'"]*(['"])/g, '$1$2').replace(/(import\(\s*['"]\.\/[\w-]+\.js)\?v=[^'"]*(['"]\s*\))/g, '$1$2');
const sources = Object.fromEntries(files.map(f => [f, strip(fs.readFileSync(path.join(modDir, f), 'utf8'))]));
// data: URLs cannot resolve relative specifiers, so rewrite ./x.js -> bare 'mod:x.js' and map those.
const bare = s => s.replace(/(from\s*['"])\.\/([\w-]+\.js)(['"])/g, '$1mod:$2$3').replace(/(import\(\s*['"])\.\/([\w-]+\.js)(['"]\s*\))/g, '$1mod:$2$3');
const imports = {};
for (const f of files) imports['mod:' + f] = 'data:text/javascript;base64,' + Buffer.from(bare(sources[f]), 'utf8').toString('base64');
const importMap = '<script type="importmap">' + JSON.stringify({ imports }) + '</script>';
const chunks = importMap + '\n<script type="module">import "mod:main.js";</script>';
const order = files;

// ---- 2. html: strip network UI only ----
let html = fs.readFileSync(path.join(src, 'crawler.html'), 'utf8');
const cut = (label, re) => { const before = html.length; html = html.replace(re, ''); if (html.length === before) throw new Error(`strip failed: ${label}`); };
cut('network-section', /\s*<div class="network-section">[\s\S]*?<\/div>/);
cut('network-status', /\s*<div id="network-status" class="network-status"[^>]*>Offline<\/div>/);
cut('network-dialog', /\s*<dialog id="network-dialog"[\s\S]*?<\/dialog>/);
cut('guide multiplayer', /\s*<h3>🌐 Multiplayer<\/h3>\s*<ol>[\s\S]*?<\/ol>/);
html = html.replace(/<title>[^<]*<\/title>/, '<title>Ascii Dungeon Crawler</title>');
html = html.replace(/Run <b>Run_Game_Server_PixelBear_Dungeon_Crawler\.cmd<\/b> in the game folder and use <b>http:\/\/localhost:8080\/crawler\.html<\/b>\./, 'This single-file edition should open by double-click; try another browser.');
html = html.replace(/<li>The local server is not running\. Run <b>Run_Game_Server_PixelBear_Dungeon_Crawler\.cmd<\/b> \(or <code>npm start<\/code>\)\.<\/li>/, '');
html = html.replace(/if \(!sessionStorage\.getItem\(key\) && location\.protocol !== 'file:'\)/, "if (!sessionStorage.getItem(key))");
if (!/<script type="module" src="modules\/main\.js[^"]*"><\/script>/.test(html)) throw new Error('module script tag not found');
html = html.replace(/<script type="module" src="modules\/main\.js[^"]*"><\/script>/, () => chunks);

// ---- 3. write ----
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'Ascii_Dungeon_Crawler.html');
fs.writeFileSync(outFile, html);
fs.writeFileSync(path.join(outDir, 'Run_Game_Ascii_Dungeon_Crawler.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nstart "" "Ascii_Dungeon_Crawler.html"\r\n');
console.log(`built ${outFile} (${(html.length / 1024).toFixed(0)} KB, ${order.length} modules inlined)`);
