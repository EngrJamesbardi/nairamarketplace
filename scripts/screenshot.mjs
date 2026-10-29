import { chromium } from "playwright";
const [,, url, out, w = "390", h = "844", full = "1"] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url, { waitUntil: "networkidle" });
await p.screenshot({ path: out, fullPage: full === "1" });
await b.close();
