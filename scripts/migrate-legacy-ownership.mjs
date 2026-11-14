// Explicit operator mapping only; this never infers ownership from a browser ownerKey.
import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { build } from "esbuild";
nextEnv.loadEnvConfig(process.cwd(), true);
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Error("Usage: node scripts/migrate-legacy-ownership.mjs owner-email");
if (process.env.SUPABASE_URL) throw Error("For Supabase, use the reviewed owner mapping SQL in Docs/TrienKhai/AUTH_DEPLOYMENT.md.");
const directory = path.resolve(process.env.MATH_STUDIO_DATA_DIR || "data");
const accounts = JSON.parse(await fs.readFile(path.join(directory, "accounts.json"), "utf8"));
const owner = accounts.accounts.find(account => account.email === email && account.status === "active" && (account.role === "author" || account.role === "admin" && account.canAuthor));
if (!owner) throw Error("Owner must exist and have author permission.");
const backup = path.join(directory, `ownership-backup-${Date.now()}`);
await fs.mkdir(backup, { recursive: true });
const bundled = await build({ stdin: { contents: 'export { MaterialSchema } from "./src/lib/contracts"; export { validateMaterial } from "./src/lib/validation"; export { validateCurriculum, curriculumLessonList } from "./src/lib/curriculum-contracts";', resolveDir: process.cwd() }, bundle: true, platform: "node", format: "esm", write: false });
const { MaterialSchema, validateMaterial, validateCurriculum, curriculumLessonList } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const materialRows = new Map();
function normalizeMaterial(raw) {
  const m = MaterialSchema.parse(raw), seen = new Set();
  for (const step of m.learningSteps) step.blockIds = step.blockIds.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
  for (const block of m.blocks) if (!seen.has(block.id)) {
    if (!m.learningSteps.length) m.learningSteps.push({ id: "step_recovered_1", title: "Bước học tập khôi phục", description: "", phase: "explore", objective: "", estimatedMinutes: 0, blockIds: [], actionLabels: [], visualActions: [] });
    m.learningSteps.at(-1).blockIds.push(block.id); seen.add(block.id);
  }
  return validateMaterial(m);
}
for (const name of ["materials.json", "curricula.json"]) {
  const file = path.join(directory, name);
  let raw;
  try { raw = await fs.readFile(file, "utf8"); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
  await fs.writeFile(path.join(backup, name), raw, { flag: "wx" });
  const rows = JSON.parse(raw);
  let count = 0, needsReview = 0;
  const quarantined = [], mapped = [];
  for (const row of rows) {
    try {
      const original = row.document || row;
      const unowned = !original.ownerId || original.ownerId === "local-teacher";
      const document = { ...original, ...(unowned ? { ownerId: owner.id } : {}) };
      if (unowned) count++;
      if (name === "materials.json") {
        // Public material remains public. Guessable legacy links and unsupported
        // school visibility require a new capability link from the owner.
        if (unowned && ["link", "school"].includes(document.visibility)) { document.visibility = "private"; needsReview++; }
        const normalized = normalizeMaterial(document);
        const publication = row.publication ? normalizeMaterial({ ...row.publication, ownerId: normalized.ownerId }) : normalized.status === "published" ? structuredClone(normalized) : null;
        const envelope = { ...row.document ? row : {}, document: normalized, publication, links: row.links || [] };
        mapped.push(envelope); materialRows.set(normalized.id, envelope);
      } else {
        const normalized = validateCurriculum(document), pins = row.pins || {};
        if (normalized.status === "published" && !row.pins) {
          for (const { lesson } of curriculumLessonList(normalized)) {
            const source = materialRows.get(lesson.materialId);
            if (source?.publication && source.document.visibility === "public" && !source.withdrawn) pins[lesson.id] = structuredClone(source.publication);
          }
          if (Object.keys(pins).length !== curriculumLessonList(normalized).length || !Object.keys(pins).length) { normalized.status = "draft"; normalized.publishedAt = null; needsReview++; }
        }
        mapped.push({ ...row.document ? row : {}, document: normalized, publication: normalized.status === "published" ? validateCurriculum({ ...(row.publication || normalized), ownerId: normalized.ownerId }) : null, pins });
      }
    } catch { quarantined.push(row); }
  }
  if (quarantined.length) await fs.writeFile(path.join(backup, `${name}.quarantined.json`), JSON.stringify(quarantined), { flag: "wx" });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(mapped), { mode: 0o600 }); await fs.rename(temporary, file);
  console.log(`${name}: mapped ${count} records to ${email}; ${needsReview} require sharing/publication review; ${quarantined.length} invalid records preserved in backup.`);
}
console.log(`Original files backed up at ${backup}. Device history and progress remain unclaimed.`);
