import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// One-time asset refresh. Runtime and builds use only the checked-in local files.
const url = "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=DM+Sans:wght@400..700&family=Inter:wght@400..800&family=JetBrains+Mono:wght@400..700&family=Material+Symbols+Outlined&family=Plus+Jakarta+Sans:wght@400..800&display=swap";
const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };
const response = await fetch(url, { headers });
if (!response.ok) throw new Error(`Font CSS download failed: ${response.status}`);
let css = await response.text();
const sourceUrls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)\s]+/g) || [])];
const folder = join(process.cwd(), "public", "fonts");
await mkdir(folder, { recursive: true });

for (const [index, source] of sourceUrls.entries()) {
  const downloaded = await fetch(source);
  if (!downloaded.ok) throw new Error(`Font download failed: ${downloaded.status} ${source}`);
  const filename = `legacy-font-${String(index + 1).padStart(2, "0")}.woff2`;
  await writeFile(join(folder, filename), Buffer.from(await downloaded.arrayBuffer()));
  css = css.replaceAll(source, `/fonts/${filename}`);
}

await writeFile(join(process.cwd(), "public", "legacy-fonts.css"), css, "utf8");
console.log(`Saved ${sourceUrls.length} local font files.`);
