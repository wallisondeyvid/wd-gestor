# Gestor - canonicalização das mutações admin de usuários concluída

Status: checkpointado
Classificacao: FASE_MAIOR_CONCLUIDA_NO_CORREDOR

## Escopo canonicalizado

- POST /gestor/api/usuarios/:id/update
- POST /gestor/api/usuarios/:id/toggle
- POST /gestor/api/usuarios/:id/delete

## Estado final do wiring

- O owner runtime efetivo agora é o shared router.
- O caminho montado vencedor para os três endpoints passa pelo wrapper do Gestor em src/modules/gestor/app/routes/userApi.js e pelo router compartilhado em src/shared/routes/userApi.js.
- A duplicidade correspondente foi removida do router legado src/modules/gestor/app/routes/usuario.js apenas para esses três caminhos.
- O mount order em src/modules/gestor/app/gestor-app.js permaneceu inalterado; a mudança de owner efetivo ocorreu pela remoção local da duplicidade no legado.

## Contrato público preservado

- O contrato público preservado continua sendo o congelado por:
  - tests/gestor-usuarios-admin-runtime-contract.test.js
  - docs/checkpoints/gestor-usuarios-admin-runtime-contract.md
- A canonicalização não alterou:
  - auth observável
  - autorização observável
  - envelopes de sucesso
  - envelopes de erro
  - comportamento com XHR
  - comportamento com POST tradicional

## Evidência executável

- Suíte focal preservada: tests/gestor-usuarios-admin-runtime-contract.test.js
- Execução focal após takeover real: node --test .\tests\gestor-usuarios-admin-runtime-contract.test.js
- Resultado validado: 17 testes, 17 passes, 0 falhas

## Resultado arquitetural

- O corredor saiu da fase de duplicidade estrutural nesses três caminhos.
- O shared router passou a ser o owner canônico efetivo em runtime para o corredor auditado.
- O router legado permanece vivo apenas para outros endpoints de usuários fora deste recorte.

## Encerramento

- A canonicalização deste corredor fica formalmente concluída no estado atual.
- Reabrir este recorte apenas com evidência nova de regressão contratual ou necessidade deliberada de nova mudança arquitetural.