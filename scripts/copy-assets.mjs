import { cpSync, mkdirSync } from "node:fs";
mkdirSync("public/mathlive", { recursive: true });
cpSync("node_modules/mathlive/fonts", "public/mathlive/fonts", {
  recursive: true,
});
cpSync("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
