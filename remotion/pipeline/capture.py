"""Live screen capture of the real app for the how-to videos.

Drives the dev server with a restored demo session, records actual video (scrolling,
clicks, page transitions) with a visible overlay cursor, and paces every beat to the
duration of its narration clip so audio and picture stay in sync.

usage: python3 capture.py <patient|clinician>
"""
import asyncio
import json
import os
import sys
import time

from playwright.async_api import async_playwright

KEY = sys.argv[1]
BASE = "http://localhost:8080"
WORK = f"/mnt/documents/howto-build/{KEY}"
MANIFEST = json.load(open(f"{WORK}/manifest.json"))
SESSION = json.load(open(f"/mnt/documents/howto-build/session-{KEY}.json"))
VIDEO_DIR = f"{WORK}/video"
W, H = MANIFEST["viewport"]["width"], MANIFEST["viewport"]["height"]

CURSOR_JS = """
(() => {
  const add = () => {
    if (document.getElementById('__oc_cursor')) return;
    const c = document.createElement('div');
    c.id = '__oc_cursor';
    c.style.cssText = [
      'position:fixed','z-index:2147483647','left:-100px','top:-100px','width:26px','height:26px',
      'pointer-events:none','border-radius:50%','background:rgba(255,255,255,0.92)',
      'border:2px solid rgba(20,60,45,0.85)','box-shadow:0 2px 10px rgba(0,0,0,0.35)',
      'transform:translate(-50%,-50%)','transition:width 90ms,height 90ms,background 90ms'
    ].join(';');
    document.documentElement.appendChild(c);
    window.addEventListener('mousemove', (e) => {
      c.style.left = e.clientX + 'px';
      c.style.top = e.clientY + 'px';
    }, true);
    window.addEventListener('mousedown', () => {
      c.style.width = '44px'; c.style.height = '44px';
      c.style.background = 'rgba(212,175,84,0.75)';
    }, true);
    window.addEventListener('mouseup', () => {
      c.style.width = '26px'; c.style.height = '26px';
      c.style.background = 'rgba(255,255,255,0.92)';
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
  document.addEventListener('DOMContentLoaded', add);
})();
"""

HIDE_CHROME_JS = """
(() => {
  const s = document.getElementById('__oc_hide') || document.createElement('style');
  s.id = '__oc_hide';
  s.textContent = `
    [data-fab-stack], .fab-stack { display: none !important; }
    button[aria-label*="Report a bug" i], button[aria-label*="bug" i] { display: none !important; }
    ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  `;
  document.head.appendChild(s);
})();
"""


async def ease_move(page, x, y, steps=22):
    cur = getattr(page, "_oc_pos", (W * 0.5, H * 0.55))
    for i in range(1, steps + 1):
        t = i / steps
        e = 1 - (1 - t) ** 3
        await page.mouse.move(cur[0] + (x - cur[0]) * e, cur[1] + (y - cur[1]) * e)
        await asyncio.sleep(0.016)
    page._oc_pos = (x, y)


async def smooth_scroll(page, to, ms=900):
    await page.evaluate(
        """([to, ms]) => new Promise((res) => {
            const start = window.scrollY, delta = to - start, t0 = performance.now();
            const step = (t) => {
              const p = Math.min(1, (t - t0) / ms);
              const e = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
              window.scrollTo(0, start + delta * e);
              if (p < 1) requestAnimationFrame(step); else res();
            };
            requestAnimationFrame(step);
        })""",
        [to, ms],
    )


async def settle(page):
    try:
        await page.wait_for_load_state("networkidle", timeout=6000)
    except Exception:
        pass
    for label in ("Accept all", "Accept", "Got it"):
        try:
            btn = page.get_by_role("button", name=label, exact=False).first
            if await btn.count() and await btn.is_visible():
                await btn.click(timeout=1200)
                break
        except Exception:
            pass
    await page.evaluate(HIDE_CHROME_JS)
    await ease_move(page, W * 0.55, H * 0.5, steps=8)


async def click_text(page, text, role="tab"):
    try:
        el = page.locator('[role="tab"]').filter(has_text=text).first
        if not await el.count():
            el = page.get_by_role("tab", name=text, exact=False).first
        if not await el.count():
            print("  ! no tab", text)
            return False
        box = await el.bounding_box(timeout=2500)
        if box:
            await ease_move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            await asyncio.sleep(0.2)
        await el.click(timeout=2500, force=True)
        await asyncio.sleep(0.8)
        await page.evaluate(HIDE_CHROME_JS)
        return True
    except Exception as e:
        print("  ! click failed", text, type(e).__name__)
        return False


async def run_step(page, step):
    d = step["do"]
    if d == "goto":
        await page.goto(BASE + step["route"], wait_until="domcontentloaded")
        await settle(page)
    elif d == "wait":
        await asyncio.sleep(step["ms"] / 1000)
    elif d == "scroll":
        await smooth_scroll(page, step["to"])
    elif d == "clickTab":
        await click_text(page, step["text"], role="tab")
    elif d == "clickFirstPatient":
        target = step.get("text", "James Thompson")
        link = page.locator('a[href^="/clinician/patients/"]').first
        if not await link.count():
            link = page.get_by_text(target, exact=False).first
        if await link.count():
            box = await link.bounding_box(timeout=2500)
            if box:
                await ease_move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                await asyncio.sleep(0.25)
            await link.click(timeout=3000, force=True)
            await settle(page)
            await page.evaluate(HIDE_CHROME_JS)
        else:
            print("  ! no patient link")
    elif d == "openAI":
        for sel in ['button[aria-label*="assistant" i]', 'button[aria-label*="AI" i]']:
            b = page.locator(sel).first
            if await b.count():
                await b.click(timeout=3000)
                break
        await asyncio.sleep(1.0)


async def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True, args=["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"]
        )
        context = await browser.new_context(
            viewport={"width": W, "height": H},
            record_video_dir=VIDEO_DIR,
            record_video_size={"width": W, "height": H},
            device_scale_factor=1,
        )
        await context.add_init_script(CURSOR_JS)
        cookies = SESSION.get("cookies") or []
        if cookies:
            await context.add_cookies([{**c, "url": BASE} for c in cookies])
        page = await context.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            "([k, v]) => localStorage.setItem(k, v)",
            [SESSION["storage_key"], json.dumps(SESSION["session"])],
        )
        await page.evaluate("() => localStorage.setItem('cookie-consent','accepted')")
        await page.goto(BASE + "/", wait_until="domcontentloaded")
        await settle(page)
        await asyncio.sleep(2)

        t0 = time.monotonic()
        timeline = []
        for b in (MANIFEST["beats"][: int(os.environ.get("OC_LIMIT", "0"))] or MANIFEST["beats"]):
            start = time.monotonic() - t0
            budget = b["duration"] + 0.7
            print(f"[{start:6.1f}s] {b['id']} budget {budget:.1f}s")
            for step in b["steps"]:
                await run_step(page, step)
            used = (time.monotonic() - t0) - start
            if used < budget:
                await asyncio.sleep(budget - used)
            end = time.monotonic() - t0
            timeline.append({"id": b["id"], "caption": b["caption"], "chapter": b["chapter"],
                             "start": start, "end": end, "audio": b["audio"],
                             "audioDuration": b["duration"]})
        await asyncio.sleep(1.5)
        video = page.video
        await context.close()
        path = await video.path()
        await browser.close()
        json.dump({"video": path, "beats": timeline}, open(f"{WORK}/timeline.json", "w"), indent=2)
        print("video:", path)
        print("total:", round(timeline[-1]["end"], 1), "s")


asyncio.run(main())
