"""Smoke-check the lapan test instance in a real Chromium at phone size."""
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8771/"
out = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                              user_agent="Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 "
                                         "(KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")
    page = ctx.new_page()
    console, errors, failed = [], [], []
    page.on("console", lambda m: console.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("requestfailed", lambda r: failed.append(f"{r.url} {r.failure}"))
    resp = page.goto(URL, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(6000)
    out["status"] = resp.status
    out["title"] = page.title()
    out["version_badge"] = page.evaluate("""() => {
        const t = document.body.innerText.match(/v?1\\.0\\.\\d+/); return t ? t[0] : null }""")
    out["visible_text_head"] = page.evaluate("() => document.body.innerText.slice(0, 700)")
    out["buttons"] = page.evaluate("() => document.querySelectorAll('button').length")
    out["inputs"] = page.evaluate("() => document.querySelectorAll('input').length")
    out["canvases"] = page.evaluate("() => document.querySelectorAll('canvas').length")
    out["horizontal_overflow"] = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    out["small_targets"] = page.evaluate("""() => [...document.querySelectorAll('button')]
        .map(b => { const r = b.getBoundingClientRect();
                    return {t: (b.innerText||b.getAttribute('aria-label')||'').trim().slice(0,40),
                            w: Math.round(r.width), h: Math.round(r.height), vis: r.width > 0 && r.height > 0}; })
        .filter(x => x.vis && (x.w < 44 || x.h < 44))""")
    out["console"] = console[:15]
    out["pageerrors"] = errors[:10]
    out["requestfailed"] = failed[:10]
    out["service_worker"] = page.evaluate("() => navigator.serviceWorker ? navigator.serviceWorker.controller !== null : null")
    # Statistics page uses the D1-backed API.
    stats = page.goto("http://127.0.0.1:8771/statistics", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)
    out["stats_status"] = stats.status
    out["stats_text"] = page.evaluate("() => document.body.innerText.slice(0, 400)")
    page.goto(URL, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2500)
    page.screenshot(path="/tmp/lapan-test-390.png", full_page=False)
    out["screenshot"] = "/tmp/lapan-test-390.png"
    browser.close()

print(json.dumps(out, indent=1, ensure_ascii=False))
