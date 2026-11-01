"""Verify the live lapan test instance at phone size against the public URL."""
import json
from playwright.sync_api import sync_playwright

URL = "https://lapan-test.dysolvit.com/"
out = {"url": URL}
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                        user_agent="Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 "
                                   "(KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")
    page = ctx.new_page()
    errs, fails, bad = [], [], []
    page.on("pageerror", lambda e: errs.append(str(e)[:160]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.on("requestfailed", lambda r: fails.append(r.url[:120]))
    page.on("response", lambda r: bad.append(f"{r.status} {r.url[:100]}") if r.status >= 400 and "/api/route" not in r.url else None)
    resp = page.goto(URL, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(6000)
    out["status"] = resp.status if resp else None
    out["title"] = page.title()
    out["version"] = page.evaluate("() => {const m=document.body.innerText.match(/v?1\\.0\\.\\d+/); return m?m[0]:null}")
    out["buttons"] = page.evaluate("() => document.querySelectorAll('button').length")
    out["canvas"] = page.evaluate("() => document.querySelectorAll('canvas').length")
    out["overflow390"] = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    out["secure_context"] = page.evaluate("() => window.isSecureContext")
    out["map_tiles"] = page.evaluate("""() => performance.getEntriesByType('resource')
        .filter(r => r.name.includes('tiles.openfreemap.org')).length""")
    out["stats_api"] = page.evaluate("async () => (await fetch('/api/statistics')).status")
    out["visit_api"] = page.evaluate("""async () => {
        const r = await fetch('/api/visit', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({id:crypto.randomUUID(), kind:'heartbeat', device:'Android', browser:'Chrome'})});
        return r.status }""")
    out["route_api"] = page.evaluate("""async () => {
        const r = await fetch('/api/route', {method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({from:[101.6869,3.139], to:[101.5183,3.0738], alternatives:false})});
        return r.status + ' ' + (await r.text()).slice(0,80) }""")
    page.set_viewport_size({"width": 320, "height": 720})
    page.wait_for_timeout(1200)
    out["overflow320"] = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(800)
    page.screenshot(path="/home/dandy/agent-workspace/lapan-malaysia/deploy/lapan-test-live.png")
    out["page_errors"] = errs[:8]
    out["failed_requests"] = fails[:8]
    out["bad_responses"] = bad[:8]
    b.close()
print(json.dumps(out, indent=1, ensure_ascii=False))
