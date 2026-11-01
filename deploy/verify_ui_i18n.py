"""Verify the UI-2 look and the BM switch on the live test URL."""
import json
from playwright.sync_api import sync_playwright

BASE = "https://lapan-test.dysolvit.com/"
out = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                        user_agent="Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 "
                                   "(KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append("page:" + str(e)[:120]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)

    page.goto(BASE, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2000)
    out["default_lang"] = page.evaluate("() => document.documentElement.lang")
    out["default_heading"] = page.evaluate("() => document.getElementById('journeytitle').textContent.trim()")
    out["switch_present"] = page.evaluate("() => !!document.querySelector('.lang-switch [data-lang=\"ms\"]')")
    out["ui_mode_initial"] = page.evaluate("() => document.documentElement.getAttribute('data-ui')")

    # Switch to BM.
    page.click('.lang-switch [data-lang="ms"]')
    page.wait_for_timeout(1200)
    out["bm_lang"] = page.evaluate("() => document.documentElement.lang")
    out["bm_heading"] = page.evaluate("() => document.getElementById('journeytitle').textContent.trim()")
    out["bm_plan"] = page.evaluate("() => document.getElementById('plan').textContent.trim()")
    out["bm_pressed"] = page.evaluate("""() => ({
        en: document.querySelector('.lang-switch [data-lang="en"]').getAttribute('aria-pressed'),
        ms: document.querySelector('.lang-switch [data-lang="ms"]').getAttribute('aria-pressed')})""")
    out["bm_stored"] = page.evaluate("() => localStorage.getItem('lapan-lang')")
    page.screenshot(path="/home/dandy/agent-workspace/lapan-malaysia/deploy/bm-live.png")

    # Persistence across a reload.
    page.reload(wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(1500)
    out["bm_after_reload"] = page.evaluate("() => document.documentElement.lang + ' | ' + document.getElementById('journeytitle').textContent.trim()")
    page.click('.lang-switch [data-lang="en"]')
    page.wait_for_timeout(800)

    # New look via the menu toggle.
    page.goto(BASE + "?ui=2", wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2000)
    out["ui2_attr"] = page.evaluate("() => document.documentElement.getAttribute('data-ui')")
    out["ui2_stored"] = page.evaluate("() => localStorage.getItem('lapan-ui')")
    out["ui2_theme"] = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    out["ui2_css_loaded"] = page.evaluate("""() => Array.from(document.styleSheets).some(s => (s.href||'').endsWith('/ui2.css'))""")
    out["overflow390"] = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    page.screenshot(path="/home/dandy/agent-workspace/lapan-malaysia/deploy/ui2-live.png")
    page.goto(BASE, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(1500)
    out["ui2_persisted"] = page.evaluate("() => document.documentElement.getAttribute('data-ui')")
    page.set_viewport_size({"width": 320, "height": 720})
    page.wait_for_timeout(1000)
    out["overflow320"] = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")

    out["sw_active"] = page.evaluate("""async () => {
        if (!('serviceWorker' in navigator)) return 'unsupported';
        const reg = await navigator.serviceWorker.ready;
        return reg.active ? reg.active.state : 'none' }""")

    # Back to the classic look for the offline check.
    page.goto(BASE, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(1500)
    ctx.set_offline(True)
    page.reload(wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(1500)
    out["offline_title"] = page.title()
    out["offline_heading"] = page.evaluate("() => document.getElementById('journeytitle') ? document.getElementById('journeytitle').textContent.trim() : null")
    ctx.set_offline(False)

    out["page_errors"] = errs[:6]
    b.close()
print(json.dumps(out, indent=1, ensure_ascii=False))
