import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const TARGET_DIRS = ["src", path.join("src", "modules")];
const NEEDLE = "#core/models/";

const TEXT_EXT = new Set([
  ".js", ".mjs", ".cjs",
  ".ts", ".tsx",
  ".jsx",
  ".json", ".yaml", ".yml",
]);

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".vercel",
  "coverage",
  "public",
  "logs",
]);

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXT.has(ext);
}

async function walk(dirAbs, outFiles) {
  let entries;
  try {
    entries = await fs.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    const abs = path.join(dirAbs, ent.name);

    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      await walk(abs, outFiles);
      continue;
    }

    if (!ent.isFile()) continue;
    if (!isTextFile(abs)) continue;

    outFiles.push(abs);
  }
}

function findOccurrences(content) {
  const hits = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(NEEDLE);
    if (idx !== -1) {
      hits.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return hits;
}

async function main() {
  const files = [];
  for (const rel of TARGET_DIRS) {
    await walk(path.join(ROOT, rel), files);
  }

  const violations = [];

  for (const fileAbs of files) {
    const content = await fs.readFile(fileAbs, "utf8");
    if (!content.includes(NEEDLE)) continue;

    const occ = findOccurrences(content);
    if (occ.length) {
      violations.push({
        file: path.relative(ROOT, fileAbs),
        occ,
      });
    }
  }

  if (violations.length) {
    console.error(`\n[GUARD FAIL] Encontrado "${NEEDLE}" em runtime:\n`);
    for (const v of violations) {
      for (const h of v.occ) {
        console.error(`- ${v.file}:${h.line}: ${h.text}`);
      }
    }
    console.error(`\nCorrija: troque "#core/models/*" por "#models/*".\n`);
    process.exit(1);
  }

  console.log(`[GUARD OK] Nenhuma referência a "${NEEDLE}" em src/ e src/modules/`);
}

main().catch((err) => {
  console.error("[GUARD ERROR]", err);
  process.exit(2);
});
