// Walk the app in a real browser and report what the console and the network
// say on each route. Sign-in goes through the app's own form so the session is
// stored the way the app stores it.
import fs from 'node:fs';

// Playwright is not a dependency of this project — it pulls a few hundred
// megabytes of browsers on install, which is a poor trade for everyone who runs
// `npm i` and never drives a browser. Resolve it from wherever it is: the
// project, a global install, or PLAYWRIGHT_PATH.
async function loadChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.mjs',
    '/usr/lib/node_modules/playwright/index.mjs',
    '/usr/local/lib/node_modules/playwright/index.mjs',
  ].filter(Boolean);
  for (const c of candidates) {
    try { return (await import(c)).chromium; } catch { /* try the next one */ }
  }
  throw new Error(
    'playwright not found. Install it with `npm i -D playwright && npx playwright install chromium`, ' +
    'or point PLAYWRIGHT_PATH at an existing install.',
  );
}
const chromium = await loadChromium();


const BASE = 'http://127.0.0.1:8080';
const SHOTS = process.env.SHOTS || new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });

const [, , who, ...routes] = process.argv;
const CREDS = {
  patient: ['demo-patient-1@onecare.you', 'Demo123!', '/sign-in'],
  clinician: ['demo-clinician-1@onecare.you', 'Demo123!', '/clinician/sign-in'],
};

const IGNORE = [
  /Download the React DevTools/i,
  /React Router Future Flag/i,
  /Lovable/i,
  /websocket|WebSocket/i,
  /realtime/i,
];

const report = [];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

let current = { route: 'boot', console: [], failed: [], pageErrors: [] };
page.on('console', (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return;
  const t = m.text();
  if (IGNORE.some((r) => r.test(t))) return;
  current.console.push(`${m.type()}: ${t.slice(0, 400)}`);
});
page.on('pageerror', (e) => current.pageErrors.push(String(e.message).slice(0, 400)));
page.on('response', async (r) => {
  if (r.status() < 400) return;
  const u = r.url();
  if (!u.includes('127.0.0.1:54321')) return;
  let body = '';
  try { body = (await r.text()).slice(0, 240); } catch { /* stream already consumed */ }
  current.failed.push(`${r.status()} ${r.request().method()} ${u.replace('http://127.0.0.1:54321', '')} :: ${body}`);
});

async function settle(ms = 1400) {
  try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch { /* long-poll keeps it busy */ }
  await page.waitForTimeout(ms);
}

if (who !== 'anon') {
  const [email, password, signInPath] = CREDS[who];
  current = { route: signInPath, console: [], failed: [], pageErrors: [] };
  await page.goto(BASE + signInPath, { waitUntil: 'domcontentloaded' });
  await settle();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await settle(2500);
  report.push({ ...current, url: page.url(), note: 'sign-in' });
  if (page.url().includes('sign-in')) {
    console.log(JSON.stringify({ fatal: 'sign-in did not leave the sign-in page', report }, null, 2));
    await page.screenshot({ path: `${SHOTS}/${who}-signin-stuck.png`, fullPage: true });
    await browser.close();
    process.exit(1);
  }
}

for (const route of routes) {
  current = { route, console: [], failed: [], pageErrors: [] };
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await settle();
  } catch (e) {
    current.pageErrors.push(`navigation: ${e.message.slice(0, 200)}`);
  }
  const shot = `${who}${route.replace(/\W+/g, '_') || '_root'}.png`;
  try { await page.screenshot({ path: `${SHOTS}/${shot}`, fullPage: false }); } catch { /* page torn down */ }
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 600) || '').catch(() => '');
  report.push({
    ...current,
    url: page.url(),
    shot,
    blank: text.trim().length < 40,
    head: text.replace(/\s+/g, ' ').slice(0, 220),
  });
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
