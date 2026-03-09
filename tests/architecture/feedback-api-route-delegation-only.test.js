import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_ROUTE_FILE = 'src/modules/gestor/app/routes/feedbackApi.js';

const ROUTER_CALL_PATTERN = /router\.(?:get|post|put|delete|patch|all)\s*\(/g;
const INLINE_CALLBACK_PATTERN = /=>|\bfunction\b/;

const FORBIDDEN_IN_ROUTE_MAPPING = [
  {
    pattern: /\breq\s*\.\s*(?:body|query|params)\b/,
    reason: 'Acesso direto a req.body/req.query/req.params dentro do mapeamento de rota.',
  },
  {
    pattern: /\bres\s*\.\s*(?:status|json|send)\s*\(/,
    reason: 'Resposta HTTP direta (res.status/json/send) dentro do mapeamento de rota.',
  },
];

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function makeSnippet(content, index, radius = 90) {
  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + radius);
  return content.slice(start, end).replace(/\s+/g, ' ').trim();
}

function findMatchingParen(content, openParenIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = openParenIndex; i < content.length; i += 1) {
    const ch = content[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = '';
      }
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(') {
      depth += 1;
      continue;
    }

    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function extractRouterCalls(content) {
  const calls = [];
  let match;

  while ((match = ROUTER_CALL_PATTERN.exec(content)) !== null) {
    const start = match.index;
    const openParenIndex = content.indexOf('(', start);
    const closeParenIndex = findMatchingParen(content, openParenIndex);

    if (openParenIndex === -1 || closeParenIndex === -1) {
      assert.fail(`Nao foi possivel fechar parenteses de chamada router.* em ${TARGET_ROUTE_FILE}.`);
    }

    let endIndex = closeParenIndex + 1;
    while (endIndex < content.length && /\s/.test(content[endIndex])) endIndex += 1;
    if (content[endIndex] === ';') endIndex += 1;

    calls.push({
      start,
      content: content.slice(start, endIndex),
    });

    ROUTER_CALL_PATTERN.lastIndex = endIndex;
  }

  return calls;
}

test('Guardrail estrutural: feedbackApi route deve permanecer delegation-only nos router.*', () => {
  const absolutePath = path.resolve(ROOT, TARGET_ROUTE_FILE);
  assert.ok(fs.existsSync(absolutePath), `Arquivo alvo nao encontrado: ${TARGET_ROUTE_FILE}`);

  const raw = fs.readFileSync(absolutePath, 'utf8');
  const content = stripComments(raw);
  const routerCalls = extractRouterCalls(content);

  assert.ok(routerCalls.length > 0, `Nenhuma chamada router.* encontrada em ${TARGET_ROUTE_FILE}.`);

  for (const call of routerCalls) {
    const inline = call.content.match(INLINE_CALLBACK_PATTERN);
    if (inline) {
      const absoluteIndex = call.start + (inline.index ?? 0);
      assert.fail(
        [
          `Handler/callback inline detectado em mapeamento de rota de ${TARGET_ROUTE_FILE}.`,
          'Use apenas composicao (middlewares + handler factory/controller) sem callback inline em router.*.',
          `Trecho: ${makeSnippet(content, absoluteIndex)}`,
        ].join('\n'),
      );
    }

    for (const rule of FORBIDDEN_IN_ROUTE_MAPPING) {
      const violation = call.content.match(rule.pattern);
      if (!violation) continue;

      const absoluteIndex = call.start + (violation.index ?? 0);
      assert.fail(
        [
          `Violacao em mapeamento de rota de ${TARGET_ROUTE_FILE}: ${rule.reason}`,
          'Este arquivo deve manter o padrao de delegacao de handler, sem logica HTTP inline no router.*.',
          `Padrao: ${rule.pattern}`,
          `Trecho: ${makeSnippet(content, absoluteIndex)}`,
        ].join('\n'),
      );
    }
  }

  assert.ok(true);
});
