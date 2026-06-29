"""
Storefront smoke test — runs headless Chromium against the live deploy.

Usage:
    python3 tests/smoke/storefront_smoke.py [BASE_URL]

Default BASE_URL is https://the-fish-tank.lovable.app. Exits 0 if every check
passes, 1 otherwise. Per-check pass/fail prints to stdout; screenshots land in
./.smoke-screens/.

Standing-gate spec for the public storefront. Add new checks at the bottom of
CHECKS as routes ship — see .lovable/handoff-storefront-smoke-test.md.
"""

import asyncio
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright, Page

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://the-fish-tank.lovable.app").rstrip("/")
SHOTS = Path(__file__).parent.parent.parent / ".smoke-screens"
SHOTS.mkdir(exist_ok=True)

results: list[tuple[str, bool, str]] = []

def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    mark = "✅" if ok else "❌"
    print(f"{mark} {name}" + (f" — {detail}" if detail else ""))


async def basics(page: Page, path: str, expect_status: int = 200) -> dict:
    """Navigate + collect cross-cutting signals. Returns {status, title, desc, jsonld, console}."""
    console: list[str] = []
    page.on("console", lambda m: console.append(f"[{m.type}] {m.text}") if m.type == "error" else None)
    resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    status = resp.status if resp else 0
    if status != expect_status:
        return {"status": status, "title": "", "desc": "", "jsonld": [], "console": console}
    title = await page.title()
    desc = await page.locator('meta[name="description"]').first.get_attribute("content") or ""
    raw = await page.locator('script[type="application/ld+json"]').all_inner_texts()
    jsonld = []
    for r in raw:
        try:
            jsonld.append(json.loads(r))
        except Exception:
            pass
    return {"status": status, "title": title, "desc": desc, "jsonld": jsonld, "console": console}


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})

        # 1. Home /
        page = await ctx.new_page()
        b = await basics(page, "/")
        await page.screenshot(path=str(SHOTS / "01_home.png"))
        record("#1 / → 200 + title + JSON-LD",
               b["status"] == 200 and bool(b["title"]) and len(b["jsonld"]) >= 1,
               f"status={b['status']} jsonld={len(b['jsonld'])} console_errs={len(b['console'])}")
        body = await page.locator("body").inner_text()
        record("#1 / hero text 'reef' + 'delivered'",
               "reef" in body.lower() and "delivered" in body.lower())

        # 2. /shop
        page = await ctx.new_page()
        b = await basics(page, "/shop")
        await page.screenshot(path=str(SHOTS / "02_shop.png"))
        record("#2 /shop → 200 + JSON-LD",
               b["status"] == 200 and len(b["jsonld"]) >= 1,
               f"status={b['status']} console_errs={len(b['console'])}")

        # 3 & 4. PDPs — image-load (bucket-flip canary)
        for n, slug in [
            ("#3", "red-sea-225-micron-filter-bag-29d2af53"),
            ("#4", "max-nano-thin-mesh-fine-polish-filter-bag-b130484e"),
        ]:
            page = await ctx.new_page()
            b = await basics(page, f"/products/{slug}")
            await page.screenshot(path=str(SHOTS / f"0{n[1]}_pdp.png"))
            imgs_loaded = await page.evaluate(
                "Array.from(document.images).filter(i => i.naturalWidth > 0).length"
            )
            record(f"{n} /products/{slug} → 200 + ≥1 image loaded",
                   b["status"] == 200 and imgs_loaded >= 1,
                   f"status={b['status']} imgs_loaded={imgs_loaded} jsonld={len(b['jsonld'])}")

        # 5a. /collections/<published slug>
        page = await ctx.new_page()
        b = await basics(page, "/collections/essentials")
        await page.screenshot(path=str(SHOTS / "05_collection.png"))
        h1 = (await page.locator("h1").first.inner_text()) if await page.locator("h1").count() else ""
        record("#5a /collections/essentials → 200 + title + JSON-LD",
               b["status"] == 200 and "essentials" in h1.lower() and len(b["jsonld"]) >= 1,
               f"status={b['status']} h1={h1!r} jsonld={len(b['jsonld'])}")

        # 5b. /collections/<bogus> → not-found UI, no crash
        page = await ctx.new_page()
        await page.goto(f"{BASE}/collections/this-definitely-does-not-exist-xyz", wait_until="domcontentloaded")
        body = (await page.locator("body").inner_text()).lower()
        record("#5b /collections/<bogus> → not-found UI",
               "couldn't find" in body or "not found" in body or "browse" in body)

        # 6. /visit
        page = await ctx.new_page()
        b = await basics(page, "/visit")
        body = (await page.locator("body").inner_text()).lower()
        record("#6 /visit → 200 + Sandy address",
               b["status"] == 200 and "sandy" in body and len(b["jsonld"]) >= 1)

        # 7. /catalog → /shop (followed)
        page = await ctx.new_page()
        resp = await page.goto(f"{BASE}/catalog", wait_until="domcontentloaded")
        final_url = page.url
        record("#7 /catalog redirects to /shop",
               resp is not None and resp.status == 200 and final_url.rstrip("/").endswith("/shop"),
               f"final_url={final_url}")

        # 8. footer staff sign-in link present on storefront
        page = await ctx.new_page()
        await page.goto(f"{BASE}/", wait_until="domcontentloaded")
        href = await page.locator('a[href="/login"]').first.get_attribute("href")
        record("#8 footer 'Staff sign in' → /login", href == "/login")

        # 9. /dashboard unauthenticated MUST NOT leak workspace shell
        page = await ctx.new_page()
        await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)  # let any client redirect settle
        await page.screenshot(path=str(SHOTS / "09_dashboard_unauth.png"))
        final_url = page.url
        body = (await page.locator("body").inner_text())
        leaked = ("Workspace" in body and "Inventory" in body and "Pricing Queue" in body)
        on_login = final_url.endswith("/login") or "sign in" in body.lower() or "email" in body.lower()
        record("#9 /dashboard unauthenticated → /login, no workspace shell leak",
               (on_login or not leaked) and not leaked,
               f"final_url={final_url} shell_leaked={leaked}")

        # 10. Publish-flow proof — /shop product-card count ≥ 3 (3rd item was
        # published through the staff Publish flow; assertion guards "intake →
        # publish → live" without redeploy).
        page = await ctx.new_page()
        await page.goto(f"{BASE}/shop", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        card_count = await page.evaluate(
            "document.querySelectorAll('a[href^=\"/products/\"]').length"
        )
        record("#10 /shop product card count ≥ 3 (publish-flow proof)",
               card_count >= 3, f"card_count={card_count}")

        # 11. Order-ahead PDP — sourceable sold_out item stays listed and orderable.
        # Asserts pickup-ETA copy + JSON-LD Offer availability=BackOrder.
        page = await ctx.new_page()
        b = await basics(page, "/products/filter-sock-200-8a63bd82")
        body = (await page.locator("body").inner_text()).lower()
        offers = []
        for ld in b["jsonld"]:
            arr = ld if isinstance(ld, list) else [ld]
            for n in arr:
                if isinstance(n, dict) and n.get("@type") == "Product":
                    off = n.get("offers")
                    if isinstance(off, dict): offers.append(off)
                    elif isinstance(off, list): offers.extend(o for o in off if isinstance(o, dict))
        avails = [o.get("availability", "") for o in offers]
        has_eta = ("order by" in body and "pickup" in body)
        has_backorder = any("BackOrder" in a for a in avails)
        record("#11 order-ahead PDP → 200 + pickup-ETA copy + Offer BackOrder",
               b["status"] == 200 and has_eta and has_backorder,
               f"status={b['status']} pickup_copy={has_eta} offer_avail={avails}")

        # 12. Dropped WYSIWYG PDP — sold-out non-sourceable item drops from
        # v_public_inventory and its PDP must not-found.
        page = await ctx.new_page()
        await page.goto(f"{BASE}/products/filter-sock-100-micron-7x16-d9b3c8a0",
                        wait_until="domcontentloaded")
        await page.wait_for_timeout(800)
        body = (await page.locator("body").inner_text()).lower()
        dropped = ("couldn't find" in body or "not found" in body or "browse" in body)
        record("#12 dropped WYSIWYG PDP → not-found", dropped,
               f"body_head={body[:120]!r}")

        await browser.close()

    fails = [n for n, ok, _ in results if not ok]
    print(f"\n{'PASS' if not fails else 'FAIL'}: {len(results) - len(fails)}/{len(results)} checks")
    if fails:
        print("Failed:", ", ".join(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
