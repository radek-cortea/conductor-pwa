import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const source = await readFile(new URL("../public/favicon.svg", import.meta.url));
const image = `data:image/svg+xml;base64,${source.toString("base64")}`;
const output = new URL("../public/icons/", import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const [name, size, scale] of [
    ["icon-192.png", 192, 1],
    ["icon-512.png", 512, 1],
    // Keep the entire mark inside the maskable icon's central safe circle.
    ["icon-512-maskable.png", 512, 0.68],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<body style="margin:0;display:grid;place-items:center;height:100vh;background:white"><img src="${image}" width="${size * scale}" height="${size * scale}" alt=""></body>`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    await page.screenshot({ path: fileURLToPath(new URL(name, output)) });
    await page.close();
  }
} finally {
  await browser.close();
}
