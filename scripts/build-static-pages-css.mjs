import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

// Home is the remaining legacy iframe; Library now owns scoped React styles.
const pages = ["home"];
const inputCss = "@tailwind base; @tailwind components; @tailwind utilities;";

for (const page of pages) {
  const htmlPath = join(process.cwd(), "public", `${page}.html`);
  const cssPath = join(process.cwd(), "public", `${page}-static.css`);
  const html = await readFile(htmlPath, "utf8");
  const inlineConfig = html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/i)?.[1];
  if (!inlineConfig) throw new Error(`Missing Tailwind theme in ${htmlPath}`);

  const runtime = { config: {} };
  runInNewContext(inlineConfig, { tailwind: runtime, window: { tailwind: runtime } }, { timeout: 1000 });
  const config = { ...runtime.config, content: [{ raw: html, extension: "html" }] };
  const result = await postcss([tailwindcss(config)]).process(inputCss, { from: undefined, to: cssPath });
  await writeFile(cssPath, result.css, "utf8");

  const cdnScript = /<script src="https:\/\/cdn\.tailwindcss\.com[^\"]*"><\/script>/i;
  let updatedHtml = html;
  if (cdnScript.test(html)) {
    updatedHtml = updatedHtml.replace(cdnScript, `<link rel="stylesheet" href="/${page}-static.css">`);
  } else if (!html.includes(`href="/${page}-static.css"`)) {
    throw new Error(`Missing local stylesheet link in ${htmlPath}`);
  }
  updatedHtml = updatedHtml.replace(/<link\s+href="https:\/\/fonts\.googleapis\.com\/[^\"]+"\s+rel="stylesheet"\s*\/?\s*>/gi, "");
  updatedHtml = updatedHtml.replace(/<link\s+(?:crossorigin(?:="")?\s+)?href="https:\/\/fonts\.gstatic\.com"\s+rel="preconnect"\s*\/?\s*>/gi, "");
  updatedHtml = updatedHtml.replace(/<link\s+href="https:\/\/fonts\.googleapis\.com"\s+rel="preconnect"\s*\/?\s*>/gi, "");
  if (!updatedHtml.includes('href="/legacy-fonts.css"')) {
    updatedHtml = updatedHtml.replace(/<\/head>/i, '<link rel="stylesheet" href="/legacy-fonts.css"></head>');
  }
  if (updatedHtml !== html) await writeFile(htmlPath, updatedHtml, "utf8");
  console.log(`${page}: ${Math.round(result.css.length / 1024)} KiB of local CSS`);
}
