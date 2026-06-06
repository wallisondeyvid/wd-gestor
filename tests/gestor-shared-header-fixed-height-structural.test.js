import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const headerSharedPath = path.join(ROOT, 'views', 'shared', 'partials', 'header-shared.ejs');
const layoutCssPath = path.join(ROOT, 'public', 'css', 'layout-modulos.css');

test('header-shared usa variante explicita de altura fixa para o topo compartilhado', () => {
  const source = fs.readFileSync(headerSharedPath, 'utf8');

  assert.match(source, /<header\s+class="hero-wd\s+hero-wd-fixed-height"/i);
  assert.match(source, /class="hero-bg"/i);
  assert.doesNotMatch(source, /object-fit\s*:/i);
  assert.doesNotMatch(source, /height\s*:\s*var\(--wd-hero-height\)/i);
});

test('layout global fixa a altura do header compartilhado sem crop por cover', () => {
  const source = fs.readFileSync(layoutCssPath, 'utf8');
  const fixedHeightBlockMatch = source.match(/\.hero-wd\.hero-wd-fixed-height\s+\.hero-bg,[\s\S]*?\}/i);

  assert.match(source, /\.hero-wd\.hero-wd-fixed-height[\s\S]*height:\s*var\(--wd-hero-height\)/i);
  assert.match(source, /\.hero-wd\.hero-wd-fixed-height[\s\S]*min-height:\s*var\(--wd-hero-height\)/i);
  assert.match(source, /\.hero-wd\.hero-wd-fixed-height[\s\S]*max-height:\s*var\(--wd-hero-height\)/i);
  assert.ok(fixedHeightBlockMatch, 'Bloco do hero-bg com altura fixa deve existir');
  assert.match(fixedHeightBlockMatch[0], /object-fit:\s*fill/i);
  assert.match(fixedHeightBlockMatch[0], /object-position:\s*left\s+center/i);
  assert.doesNotMatch(fixedHeightBlockMatch[0], /object-fit:\s*cover/i);
  assert.doesNotMatch(source, /background-size:\s*cover/i);
});