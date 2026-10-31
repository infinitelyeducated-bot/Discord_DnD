// Stamps every module import with ?v=<build> so a browser can never load a
// mix of old cached modules and new ones (which blanks the whole page).
// Run: node stamp-version.cjs   (also runs automatically from `npm start`)
const fs = require('fs');
const path = require('path');

const build = Date.now().toString(36);
const dir = path.join(__dirname, 'modules');
let imports = 0;

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const full = path.join(dir, file);
    let src = fs.readFileSync(full, 'utf8');
    src = src.replace(/(from\s+['"]\.\/[\w-]+\.js)(\?v=[^'"]*)?(['"])/g, (m, a, v, q) => { imports++; return `${a}?v=${build}${q}`; });
    src = src.replace(/(import\(\s*['"]\.\/[\w-]+\.js)(\?v=[^'"]*)?(['"]\s*\))/g, (m, a, v, q) => { imports++; return `${a}?v=${build}${q}`; });
    fs.writeFileSync(full, src);
}

const html = path.join(__dirname, 'crawler.html');
let page = fs.readFileSync(html, 'utf8');
page = page.replace(/src="modules\/main\.js(\?v=[^"]*)?"/, `src="modules/main.js?v=${build}"`);
fs.writeFileSync(html, page);

console.log(`stamped build ${build}: ${imports} module imports + crawler.html`);
