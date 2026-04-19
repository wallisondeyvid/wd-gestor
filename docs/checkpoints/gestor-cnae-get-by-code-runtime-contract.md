# Checkpoint: Gestor CNAE GET by Code Runtime Contract

Data: 2026-04-19
Escopo: congelamento minimo e focal do corredor GET /gestor/cnaes/:codigo

## Corredor validado

- Montagem do subapp Gestor em /gestor via src/modules/gestor/app/gestor-app.js.
- Borda do corredor em src/modules/gestor/app/routes/cnaeApi.js com requireLogin aplicado ao router antes do GET /cnaes/:codigo.
- Owner vivo em src/modules/gestor/app/controllers/cnaeApiController.js via obterCnae.
- Costura real de leitura no proprio controller via getCnaeByCodeCore -> loadCnaesFile -> leitura de src/public/data/cnaes_lista.json.

## Contrato runtime observado

- Sem sessao, o corredor preserva o contrato real atual de autenticacao do caminho nao-API: redirect para /gestor/login ou entrega da pagina de login, sem entrar em owner JSON.
- Com sessao valida, GET /gestor/cnaes/:codigo retorna 404 com success=false, code=NOT_FOUND e message='CNAE não encontrado' quando o codigo nao existe.
- Com sessao valida, GET /gestor/cnaes/:codigo retorna 200 com success=true e payload do CNAE quando o codigo existe.
- A busca por codigo permanece case-insensitive no contrato atual do owner.

## Prova focal criada

- tests/gestor-cnae-get-by-code-runtime-contract.test.js
- Execucao validada com node --test .\\tests\\gestor-cnae-get-by-code-runtime-contract.test.js
- Resultado observado: 3 testes, 3 passes, 0 falhas.

## Necessidade de microcut em producao

- Nao houve necessidade real de microcut em logica de producao.
- O corredor ja comportava freeze focal limpo no estado atual.

## Estado final

- O recorte ficou limpo para o alvo unico GET /gestor/cnaes/:codigo.
- A producao permaneceu inalterada nesta rodada.
- Nao houve expansao para GET /gestor/cnaes nem para outras familias.