# Checkpoint: GET /gestor/api/funcionarios/disponiveis/:unidadeId

## Escopo
- Endpoint congelado: `GET /gestor/api/funcionarios/disponiveis/:unidadeId`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`listarFuncionariosDisponiveis`)
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`
- Consumidor vivo principal confirmado em `views/gestor/usuarios.ejs`

## Contrato runtime congelado
- Sem sessão: `401` JSON de unauthorized emitido pelo `requireLogin`.
- Fora do escopo contextual: `200` JSON com `success: true` e lista vazia em `data`.
- Unidade inexistente, ausente ou sem funcionários elegíveis: `200` JSON com `success: true` e lista vazia em `data`.
- Sucesso com funcionários disponíveis: `200` JSON com `success: true` e lista em `data`, contendo ao menos `_id`, `nome`, `cpf` e `email`.
- Falha interna induzida no acesso ao model tenant: `500` JSON no shape de `serverError(...)` observado em runtime.

## Consumidor vivo principal
- A tela de usuários chama o endpoint em `carregarFuncionariosDisponiveis(...)` e `carregarFuncionariosDisponiveisEdicao(...)` dentro de `views/gestor/usuarios.ejs`.
- Observação de compatibilidade: o owner atual responde via `ok(res, array)` e portanto encapsula a lista em `data`; a tela ainda consulta `data.funcionarios`, o que caracteriza tensão entre consumidor e owner, mas não foi alterado nesta rodada porque o objetivo foi congelar o runtime real sem patch estrutural.

## Evidência executável
- Suíte focal criada: `tests/gestor-funcionarios-disponiveis-runtime-contract.test.js`
- Execução validada: `node --test .\tests\gestor-funcionarios-disponiveis-runtime-contract.test.js`
- Resultado final: `5` testes passando.

## Classificação final
- Decisão: congelamento local.
- Motivo: o handler já é curto, tem owner único e contrato observável simples; não apareceu microrefactor pequeno, local e proporcional que justificasse tocar em produção nesta rodada.