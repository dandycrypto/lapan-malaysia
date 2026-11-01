"""Identify non-2xx asset/network responses on the lapan test instance."""
import json
from playwright.sync_api import sync_playwright

bad = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on("response", lambda r: bad.append({"status": r.status, "url": r.url[:160]}) if r.status >= 400 else None)
    page.goto("http://127.0.0.1:8771/", wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(8000)
    page.evaluate("() => window.scrollTo(0, 400)")
    page.wait_for_timeout(3000)
    print(json.dumps(bad[:20], indent=1))
    b.close()
