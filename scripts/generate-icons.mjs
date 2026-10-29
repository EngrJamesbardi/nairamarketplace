// Renders the SVG brand marks to PNG app icons using the pre-installed Chromium (Playwright).
// Usage: node scripts/generate-icons.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const out = "public/icons";
mkdirSync(out, { recursive: true });
const jobs = [
  ["public/brand/mark.svg", "icon-192.png", 192],
  ["public/brand/mark.svg", "icon-512.png", 512],
  ["public/brand/mark-maskable.svg", "maskable-192.png", 192],
  ["public/brand/mark-maskable.svg", "maskable-512.png", 512],
  ["public/brand/mark-maskable.svg", "apple-touch-icon.png", 180],
  ["public/brand/mark.svg", "favicon-32.png", 32],
  ["public/brand/mark-mono.svg", "monochrome-512.png", 512],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, name, size] of jobs) {
  const svg = readFileSync(src, "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: `${out}/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log("icons written to", out);
