"""Verify the deployed PR stack on the live test URL, including the service worker."""
import json
from playwright.sync_api import sync_playwright

URL = "https://lapan-test.dysolvit.com/"
out = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                        user_agent="Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 "
                                   "(KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")
    page = ctx.new_page()
    errs, hosts, bad = [], set(), []
    page.on("pageerror", lambda e: errs.append("page:" + str(e)[:120]))
    page.on("console", lambda m: errs.append("console:" + m.text[:120]) if m.type == "error" else None)
    page.on("request", lambda r: hosts.add(r.url.split("/")[2]))
    page.on("response", lambda r: bad.append(f"{r.status} {r.url[:90]}") if r.status >= 400 and "/api/route" not in r.url else None)

    resp = page.goto(URL, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2500)
    out["status"] = resp.status if resp else None
    out["title"] = page.title()
    out["external_hosts"] = sorted(h for h in hosts if h != "lapan-test.dysolvit.com")
    out["features"] = page.evaluate("""() => ({
        menu: !!document.getElementById('openMenu'),
        speed_margin: !!document.getElementById('speedMargin'),
        report_problem: !!document.getElementById('reportProblem'),
        sos: !!document.getElementById('openSos'),
        offline_script: !!Array.from(document.scripts).find(s => s.src.endsWith('/offline.js')),
        leaflet_local: !!Array.from(document.scripts).find(s => s.src.endsWith('/leaflet.js')),
        speed_limit_toggle: !!document.getElementById('speedLimits')
    })""")
    out["leaflet_version"] = page.evaluate("() => window.L && window.L.version ? window.L.version : null")
    out["sw"] = page.evaluate("""async () => {
        if (!('serviceWorker' in navigator)) return 'unsupported';
        const reg = await navigator.serviceWorker.ready;
        return {scope: reg.scope, active: !!reg.active, state: reg.active ? reg.active.state : null} }""")
    out["overflow390"] = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    page.set_viewport_size({"width": 320, "height": 720})
    page.wait_for_timeout(1000)
    out["overflow320"] = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(600)
    page.screenshot(path="/home/dandy/agent-workspace/lapan-malaysia/deploy/pr-stack-live.png")

    # Offline reload: the shell must still render from the service worker cache.
    ctx.set_offline(True)
    page.reload(wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)
    out["offline_title"] = page.title()
    out["offline_body"] = page.evaluate("() => document.body.innerText.slice(0,120)")
    out["offline_menu"] = page.evaluate("() => !!document.getElementById('openMenu')")
    ctx.set_offline(False)

    out["page_errors"] = errs[:6]
    out["bad_responses"] = bad[:6]
    b.close()
print(json.dumps(out, indent=1, ensure_ascii=False))
