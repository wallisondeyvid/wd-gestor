# Checkpoint: GET /gestor/api/funcionarios/match

## Escopo
- Endpoint congelado: `GET /gestor/api/funcionarios/match`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`matchFuncionario`)
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`
- Consumidor vivo principal confirmado em `views/gestor/usuarios.ejs`

## Contrato runtime congelado
- Sem sessão: `401` JSON de unauthorized emitido pelo `requireLogin`.
- Fora do escopo contextual: `200` JSON com `success: true` e `data: { exists: false }`.
- Sem match: `200` JSON com `success: true` e `data: { exists: false }`.
- Sucesso com match: `200` JSON com `success: true` e `data` contendo `exists: true`, `matchType: 'cpf+unidade'`, `funcionario` com `_id`, `nome`, `cpf`, `email`, `unidade_id`, `usuario_id`, `hasUsuario`, e `canLink`.
- Falha interna induzida no lookup por CPF da unidade tenant: `500` JSON no shape de `serverError(...)` observado em runtime.

## Consumidor vivo principal
- A tela de usuários chama o endpoint no precheck de criação/vínculo em `views/gestor/usuarios.ejs`.
- Observação de compatibilidade: o consumidor já trata `matchJson.data || matchJson`, o que está alinhado com o owner atual que responde via `ok(...)` encapsulando o payload em `data`.

## Evidência executável
- Suíte focal criada: `tests/gestor-funcionarios-match-runtime-contract.test.js`
- Execução validada: `node --test .\tests\gestor-funcionarios-match-runtime-contract.test.js`
- Resultado final: `5` testes passando.

## Classificação final
- Decisão: congelamento local.
- Motivo: o handler já é curto, o owner é único e o contrato observável está explícito; não apareceu microrefactor pequeno, local e proporcional que justificasse tocar em produção nesta rodada.