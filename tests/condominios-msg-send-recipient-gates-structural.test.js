import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const filePath = path.resolve(process.cwd(), 'src/modules/condominios/app/condominios-app.js');

async function readSource() {
  return fs.readFile(filePath, 'utf8');
}

function extractRouteBlock(source, routeSignature) {
  const start = source.indexOf(routeSignature);
  assert.notEqual(start, -1, `rota não encontrada: ${routeSignature}`);

  const end = source.indexOf('\n// API: listar marcadores', start + routeSignature.length);
  if (end === -1) return source.slice(start);
  return source.slice(start, end);
}

test('POST /condominios/api/msg/messages classifica pessoal Portal por CondUsuario e bloqueia destinatarios suspensos com conjunto local', async () => {
  const source = await readSource();
  const routeBlock = extractRouteBlock(source, "app.post('/api/msg/messages', maybeUploadMsgAttachments, async (req, res) => {");

  assert.match(
    routeBlock,
    /if \(CondUsuario && unitIds\.length\) \{[\s\S]*?const condEmails = await CondUsuario\.find\(\{ ativo: \{ \$ne: false \}, unidade_id: \{ \$in: unitIds \} \}\)[\s\S]*?if \(em\) allowedEmails\.add\(em\);[\s\S]*?if \(em && isEmailish\(em\)\) portalPersonalEmails\.add\(em\);[\s\S]*?\}/
  );
  assert.match(
    routeBlock,
    /const suspendedRecipientOwners = new Set\(\[[\s\S]*?\.\.\.Array\.from\(suspendedOwnersPortal \|\| \[\]\),[\s\S]*?\.\.\.Array\.from\(suspendedOwnersColab \|\| \[\]\),[\s\S]*?\]\);[\s\S]*?const bad = personalRecipients\.find\(em => suspendedRecipientOwners\.has\(em\)\);/
  );
  assert.doesNotMatch(routeBlock, /const bad = personalRecipients\.find\(em => suspendedOwners\.has\(em\)\);/);
});