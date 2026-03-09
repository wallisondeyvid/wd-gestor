import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_ROUTE_FILE = 'src/modules/gestor/app/routes/widgetSettingsApi.js';

const FORBIDDEN_FILE_PATTERNS = [
  {
    pattern: /\bconst\s+(?!router\b)[A-Za-z_$][\w$]*/,
    reason: 'Declaracao local alem de "const router" detectada.',
  },
  {
    pattern: /\b(?:let|var)\s+[A-Za-z_$][\w$]*/,
    reason: 'Declaracao local mutavel detectada na rota.',
  },
  {
    pattern: /\b(?:function|class)\b/,
    reason: 'Definicao local de funcao/classe detectada na rota.',
  },
  {
    pattern: /\breq\s*\.\s*(?:body|query|params)\b/,
    reason: 'Acesso direto a req.body/req.query/req.params detectado na rota.',
  },
  {
    pattern: /\bres\s*\.\s*(?:status|json|send)\s*\(/,
    reason: 'Resposta HTTP direta (res.status/json/send) detectada na rota.',
  },
  {
    pattern: /\b(?:try|catch|await)\b/,
    reason: 'Controle de fluxo assinc/erro detectado na rota.',
  },
];

const INLINE_HANDLER_PATTERN = /router\.(?:get|post|put|delete|patch|all)\s*\([\s\S]*?(?:=>|\bfunction\b)/;

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function makeSnippet(content, index, radius = 80) {
  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + radius);
  return content.slice(start, end).replace(/\s+/g, ' ').trim();
}

test('Guardrail estrutural: widgetSettingsApi route deve ser delegation-only', () => {
  const absolutePath = path.resolve(ROOT, TARGET_ROUTE_FILE);
  assert.ok(fs.existsSync(absolutePath), `Arquivo alvo nao encontrado: ${TARGET_ROUTE_FILE}`);

  const raw = fs.readFileSync(absolutePath, 'utf8');
  const content = stripComments(raw);

  const inlineMatch = content.match(INLINE_HANDLER_PATTERN);
  if (inlineMatch) {
    const index = inlineMatch.index ?? 0;
    assert.fail(
      [
        `Handler inline detectado em ${TARGET_ROUTE_FILE}.`,
        'A rota deve apenas mapear middlewares + controller (sem callback inline).',
        `Trecho: ${makeSnippet(content, index)}`,
      ].join('\n'),
    );
  }

  for (const { pattern, reason } of FORBIDDEN_FILE_PATTERNS) {
    const match = content.match(pattern);
    if (!match) continue;
    const index = match.index ?? 0;

    assert.fail(
      [
        `Violacao em ${TARGET_ROUTE_FILE}: ${reason}`,
        'Este arquivo deve permanecer apenas como composicao de rota.',
        `Padrao: ${pattern}`,
        `Trecho: ${makeSnippet(content, index)}`,
      ].join('\n'),
    );
  }

  assert.ok(true);
});