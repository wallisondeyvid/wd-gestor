#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'architecture');

const TREE_ROOTS = [
  'src',
  'routes',
  'services',
  'public',
  'models',
  'tests',
  'scripts'
];

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const IMPORT_RE = /(?:import\s+(?:[^'\"]+?\s+from\s+)?|import\()\s*['\"]([^'\"]+)['\"]/g;

function norm(rel) {
  return String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function safeRead(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFilesRecursive(relDir) {
  const fullDir = path.join(ROOT, relDir);
  if (!fs.existsSync(fullDir)) return [];

  const out = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = norm(path.relative(ROOT, full));
      if (entry.isDirectory()) walk(full);
      else out.push(rel);
    }
  }

  walk(fullDir);
  return out;
}

function buildTree(relDir, depth = 0, maxDepth = 4) {
  const fullDir = path.join(ROOT, relDir);
  if (!fs.existsSync(fullDir)) return [];
  if (depth > maxDepth) return [];

  const lines = [];
  const entries = fs.readdirSync(fullDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const marker = entry.isDirectory() ? '/' : '';
    lines.push(`${'  '.repeat(depth)}- ${entry.name}${marker}`);
    if (entry.isDirectory()) {
      lines.push(...buildTree(path.join(relDir, entry.name), depth + 1, maxDepth));
    }
  }

  return lines;
}

function detectEntrypoints() {
  const candidates = [
    'src/start.js',
    'src/server/createServer.js',
    'src/server.js',
    'src/app.js',
    'package.json'
  ];
  return candidates.filter(exists);
}

function getDuplicationByDomain() {
  const domains = ['services', 'models', 'utils'];
  const buckets = new Map();

  const allFiles = listFilesRecursive('src')
    .concat(listFilesRecursive('services'))
    .concat(listFilesRecursive('models'))
    .concat(listFilesRecursive('routes'));

  for (const rel of allFiles) {
    const lower = rel.toLowerCase();
    const domain = domains.find((d) => lower.includes(`/${d}/`) || lower.startsWith(`${d}/`) || lower.includes(`${d}.`));
    if (!domain) continue;

    const base = path.basename(rel).toLowerCase();
    const key = `${domain}:${base}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(norm(rel));
  }

  const rows = [];
  for (const [key, files] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const uniq = [...new Set(files)].sort();
    if (uniq.length < 2) continue;
    const [domain, name] = key.split(':');
    rows.push({ domain, name, files: uniq });
  }

  return rows;
}

function classifyModule(fileRel) {
  const rel = norm(fileRel);
  const m = rel.match(/^src\/modules\/([^/]+)/);
  if (m) return `module:${m[1]}`;
  const top = rel.split('/')[1] || rel.split('/')[0] || 'root';
  return `src:${top}`;
}

function mapImportTarget(target) {
  const t = String(target || '');
  if (t.startsWith('#')) return t.split('/')[0];
  if (t.startsWith('.')) return 'relative';
  if (t.startsWith('/')) return 'absolute';
  return `pkg:${t.split('/')[0]}`;
}

function buildImportGraph() {
  const srcFiles = listFilesRecursive('src').filter((rel) => CODE_EXT.has(path.extname(rel).toLowerCase()));
  const graph = new Map();

  for (const rel of srcFiles) {
    const full = path.join(ROOT, rel);
    let text = '';
    try { text = safeRead(full); } catch { continue; }

    const owner = classifyModule(rel);
    if (!graph.has(owner)) graph.set(owner, new Map());

    const local = graph.get(owner);
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(text)) !== null) {
      const target = mapImportTarget(match[1]);
      local.set(target, (local.get(target) || 0) + 1);
    }
  }

  const out = [];
  for (const owner of [...graph.keys()].sort()) {
    const pairs = [...graph.get(owner).entries()]
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, 15)
      .map(([target, count]) => ({ target, count }));
    out.push({ owner, imports: pairs });
  }

  return out;
}

function write(fileName, content) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, fileName), content, 'utf8');
}

function renderMapMd() {
  const entrypoints = detectEntrypoints();
  const sections = [];
  sections.push('# MAP');
  sections.push('');
  sections.push('## Entrypoints');
  for (const ep of entrypoints) sections.push(`- ${ep}`);
  sections.push('');

  sections.push('## Tree (relevante)');
  for (const root of TREE_ROOTS) {
    if (!exists(root)) continue;
    sections.push('');
    sections.push(`### ${root}`);
    const tree = buildTree(root, 0, 3);
    sections.push(...tree);
  }
  sections.push('');
  return sections.join('\n') + '\n';
}

function renderDuplicationsMd(rows) {
  const lines = ['# DUPLICATIONS', ''];
  if (!rows.length) {
    lines.push('Nenhuma duplicação detectada para services/models/utils.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| Domain | Name | Paths |');
  lines.push('|---|---|---|');
  for (const row of rows) {
    lines.push(`| ${row.domain} | ${row.name} | ${row.files.join('<br>')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderImportGraphMd(graph) {
  const lines = ['# IMPORT_GRAPH', ''];
  for (const node of graph) {
    lines.push(`## ${node.owner}`);
    if (!node.imports.length) {
      lines.push('- (sem imports detectados)');
    } else {
      for (const item of node.imports) {
        lines.push(`- ${item.target}: ${item.count}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const dup = getDuplicationByDomain();
  const graph = buildImportGraph();

  write('MAP.md', renderMapMd());
  write('DUPLICATIONS.md', renderDuplicationsMd(dup));
  write('IMPORT_GRAPH.md', renderImportGraphMd(graph));

  console.log('[arch:map] gerado:', path.join('docs', 'architecture', 'MAP.md'));
  console.log('[arch:map] gerado:', path.join('docs', 'architecture', 'DUPLICATIONS.md'));
  console.log('[arch:map] gerado:', path.join('docs', 'architecture', 'IMPORT_GRAPH.md'));
}

main();
