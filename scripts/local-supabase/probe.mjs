// Targeted interaction probes. Each one asks a question the route sweep cannot:
// what does the patient actually see when the platform refuses them.
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
const CREDS = {
  patient: ['demo-patient-1@onecare.you', 'Demo123!', '/sign-in'],
  clinician: ['demo-clinician-1@onecare.you', 'Demo123!', '/clinician/sign-in'],
};

export async function open(who) {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const log = { console: [], failed: [], errors: [] };
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.console.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => log.errors.push(String(e.message).slice(0, 300)));
  page.on('response', async (r) => {
    if (r.status() >= 400 && r.url().includes('54321')) {
      let b = ''; try { b = (await r.text()).slice(0, 200); } catch { /* consumed */ }
      log.failed.push(`${r.status()} ${r.request().method()} ${r.url().replace('http://127.0.0.1:54321', '')} :: ${b}`);
    }
  });
  if (who !== 'anon') {
    const [email, password, p] = CREDS[who];
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    // The cookie banner sits over the bottom of every page and swallows clicks.
    try { await page.getByRole('button', { name: /Accept All|Necessary Only/i }).first().click({ timeout: 2500 }); } catch { /* already dismissed */ }
    await page.waitForTimeout(500);
  }
  return { browser, page, log };
}

export async function shot(page, name, full = true) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
  return `${SHOTS}/${name}.png`;
}
