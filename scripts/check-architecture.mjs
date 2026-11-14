import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd(),
  src = path.join(root, "src");
const files = fs
  .readdirSync(src, { recursive: true })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => path.join(src, file));
const modules = new Map();
const server = new Set(
  [
    "agent.ts",
    "openrouter.ts",
    "jev.ts",
    "solve-plan.ts",
    "solve-outcome.ts",
    "store.ts",
    "solve-store.ts",
    "exploration-store.ts",
    "curriculum-store.ts",
    "visual-program-generation.ts",
    "http.ts",
  ].map((file) => path.join(src, "lib", file)),
);
const errors = [];
const resolve = (from, name) => {
  const base = name.startsWith("@/")
    ? path.join(src, name.slice(2))
    : name.startsWith(".")
      ? path.resolve(path.dirname(from), name)
      : null;
  return (
    base &&
    [
      base + ".ts",
      base + ".tsx",
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    ].find((file) => fs.existsSync(file))
  );
};
for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  // Type-only edges disappear here, matching the actual browser bundle.
  const output = ts.transpileModule(original, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.Preserve,
    },
  }).outputText;
  const ast = ts.createSourceFile(file, output, ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  modules.set(file, {
    client: /^\s*["']use client["'];/.test(original),
    imports,
  });
}
for (const [entry, module] of modules)
  if (module.client) {
    const seen = new Set();
    function walk(file, chain) {
      if (seen.has(file)) return;
      seen.add(file);
      if (server.has(file) || file.includes(path.join("lib", "auth", "server")))
        errors.push(chain.join(" -> "));
      for (const name of modules.get(file)?.imports || []) {
        if (
          name.startsWith("node:") ||
          ["next/headers", "fs", "node:fs", "server-only"].includes(name)
        )
          errors.push([...chain, name].join(" -> "));
        const dependency = resolve(file, name);
        if (dependency)
          walk(dependency, [...chain, path.relative(root, dependency)]);
      }
    }
    walk(entry, [path.relative(root, entry)]);
  }
// Domain folders contain only portable data and transformations.
for (const [file, module] of modules)
  if (file.includes(path.join("lib", "workspace"))) {
    for (const name of module.imports)
      if (/^(react|next|node:)/.test(name) || name.includes("/components/"))
        errors.push(`Domain import: ${path.relative(root, file)} -> ${name}`);
    const seen = new Set();
    function checkDomain(current, chain) {
      if (seen.has(current)) return;
      seen.add(current);
      for (const name of modules.get(current)?.imports || []) {
        const dependency = resolve(current, name);
        if (/^(react($|\/)|react-dom($|\/)|next($|\/)|node:)/.test(name) ||
          dependency && (server.has(dependency) || dependency.includes(path.join("src", "components")) ||
          /[\\/](client|browser-draft|runtime|three-runtime|blank-board-runtime)\.ts$/.test(dependency))) {
          errors.push(`Domain dependency: ${[...chain, name].join(" -> ")}`);
          continue;
        }
        if (dependency) checkDomain(dependency, [...chain, path.relative(root, dependency)]);
      }
    }
    checkDomain(file, [path.relative(root, file)]);
  }
const panelNames =
  /^(Solve(Header|InputPanel|ReviewPanel|SolutionPanel)|Explore(Catalog|InputPanel|ContextPanel)|Library(Layout|EntryCard))\.tsx$/;
for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  if (
    panelNames.test(path.basename(file)) ||
    path.basename(file) === "view-contracts.ts"
  ) {
    if (
      /ReturnType\s*<\s*typeof\s+use[A-Z]|SetStateAction|use(Solve|Explore)Workspace/.test(original)
    )
      errors.push(
        `UI contract depends on controller state: ${path.relative(root, file)}`,
      );
    if (
      /\b(fetch|localStorage|sessionStorage)\b|["']@\/lib\/(client|browser-draft)["']/.test(
        original,
      )
    )
      errors.push(
        `Panel accesses an adapter directly: ${path.relative(root, file)}`,
      );
  }
}
if (errors.length) {
  console.error([...new Set(errors)].join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Architecture boundaries passed (${files.length} source modules, runtime import graph).`,
  );
