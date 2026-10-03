// Post-build: write dist/<route>/index.html for every public route, with that
// route's own <title>, description, canonical and OG tags plus a <noscript>
// summary, so crawlers that do not run JavaScript see distinct, honest pages.
// The SPA bundle still boots and replaces #root, so behaviour is unchanged.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { publicRoutes, ROOT, ORIGIN } from './public-routes.mjs';

const dist = path.join(ROOT, 'dist');
const shell = path.join(dist, 'index.html');
if (!existsSync(shell)) { console.error('dist/index.html missing'); process.exit(1); }
const base = readFileSync(shell, 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const rep = (s) => s.replace(/\$/g, '$$$$');

function render(r) {
  const url = `${ORIGIN}${r.path}`;
  const t = rep(esc(r.title));
  const d = rep(esc(r.description));
  let h = base
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`);
  const extra = `    <link rel="canonical" href="${url}" />\n    <meta property="og:url" content="${url}" />\n    <meta name="twitter:title" content="${esc(r.title)}" />\n    <meta name="twitter:description" content="${esc(r.description)}" />\n`;
  h = h.replace('</head>', () => `${extra}  </head>`);
  const ns = `<noscript><h1>${esc(r.title)}</h1><p>${esc(r.description)}</p><p><a href="/">OneCare home</a> · <a href="/features">Features</a> · <a href="/pricing">Pricing</a> · <a href="/docs">Docs</a> · <a href="/for-clinicians">For clinicians</a> · <a href="/disclaimer">Medical disclaimer</a></p></noscript>`;
  return h.replace('<div id="root"></div>', () => `<div id="root"></div>\n    ${ns}`);
}

let n = 0;
for (const r of publicRoutes()) {
  if (r.path === '/') { writeFileSync(shell, render(r)); n++; continue; }
  const dir = path.join(dist, r.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), render(r));
  n++;
}
console.log(`prerendered ${n} public route shells`);
