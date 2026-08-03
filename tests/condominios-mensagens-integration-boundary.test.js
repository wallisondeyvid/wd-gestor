import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = 'src/modules/condominios/app/condominios-app.js';

function readSource() {
  return fs.readFileSync(sourcePath, 'utf8');
}

test('Condomínios pode integrar com modelos de mensagens, mas não expor API legada', () => {
  const src = readSource();

  assert.match(
    src,
    /import\s+CondMsgMailbox\s+from\s+'#models\/cond_msg_mailbox\.js';/,
    'Condomínios ainda pode usar CondMsgMailbox para integração sistêmica'
  );

  assert.match(
    src,
    /import\s+CondMsgMessage\s+from\s+'#models\/cond_msg_message\.js';/,
    'Condomínios ainda pode usar CondMsgMessage para integração sistêmica'
  );

  assert.match(
    src,
    /app\.use\('\/api\/msg',\s*\(req,\s*res\)\s*=>\s*\{/,
    'API legada /condominios/api/msg deve permanecer bloqueada'
  );

  assert.match(
    src,
    /res\.status\(410\)\.json\(\{\s*error:\s*'Caixa de Mensagens migrada para \/mensagens\/api\/msg'/s,
    'bloqueio deve informar o endpoint correto em /mensagens/api/msg'
  );

  assert.doesNotMatch(
    src,
    /app\.(get|post|put|patch|delete)\('\/api\/msg/s,
    'Condomínios não deve registrar rotas HTTP próprias em /api/msg'
  );

  assert.doesNotMatch(
    src,
    /res\.render\(['"`](condominios\/)?caixa_de_mensagem['"`]/,
    'Condomínios não deve renderizar UI própria da Caixa de Mensagens'
  );
});

test('Usos de CondMsg em Condomínios ficam associados a integração sistêmica conhecida', () => {
  const src = readSource();

  assert.match(
    src,
    /async\s+function\s+ensureHabPublicMailboxForHabitacao/,
    'integração de caixa vinculada à habitação deve ser explícita'
  );

  assert.match(
    src,
    /async\s+function\s+runCondMsgRetention/,
    'retenção automática de mensagens deve ser explícita'
  );

  assert.match(
    src,
    /clientNonce\s*=\s*`assembleia:\$\{String\(doc\._id\)\}:convocacao`/,
    'envio sistêmico de assembleia deve preservar idempotência por clientNonce'
  );

  assert.match(
    src,
    /CondMsgMessage\.create\(\{/,
    'envio sistêmico de convocação ainda cria mensagem formal'
  );

  assert.match(
    src,
    /CondMsgMailbox\.updateMany\(\s*\n\s*\{\s*ativo:\s*\{\s*\$ne:\s*false\s*\},\s*link_type:\s*'habitacao'/s,
    'exclusão de habitação deve desativar caixa vinculada'
  );
});
