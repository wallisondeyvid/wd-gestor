# Checkpoint: POST /gestor/api/funcionarios create core residual

## Escopo
- Subcorredor congelado: núcleo base remanescente do owner `POST /gestor/api/funcionarios`.
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`createFuncionario`, `criarUsuarioAuto`, `handleFuncionarioCreateDuplicateError` e helpers contextuais imediatos).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado nesta rodada: formulário principal em `views/gestor/funcionarios/funcionarios_index.ejs`, com envio por `fetch` via `public/js/funcionarios/funcionarios_index.js`.

## Fronteira congelada
- Esta rodada congela apenas o residual honesto do create core.
- O recorte inclui: gate de sessão, gate contextual por unidade, validação de `pis`, duplicidade por `email`, shape do payload escalar base observado no create e os outcomes alternativos de `autoUser`.
- O recorte exclui explicitamente: foto, anexos, biometria, `dependentes_json`, `beneficios_json`, `face_capturas_json`, `fp_capturas_json`, `face_imagem`, `req.files`, PUTs, GETs, delete-post, match e disponíveis.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Unidade não encontrada'`.
- `PIS` inválido: `400` JSON com `success: false`, `code: 'BAD_REQUEST'`, `message: 'PIS inválido'` e `campo: 'pis'`.
- Duplicidade por `email`: `400` JSON com `success: false`, `code: 'BAD_REQUEST'`, `message: 'Já existe um funcionário cadastrado com este e-mail.'` e `campo: 'email'`.
- Sucesso com payload escalar mínimo expandido observável: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` espelhando o identificador criado e `data.autoUser` presente.
- `autoUser` outcome `created`: `ok: true`, `outcome: 'created'`, `reusedUser: false` e `membershipCreated: true`.
- `autoUser` outcome `linked`: `ok: true`, `outcome: 'linked'`, `reusedUser: true` e `membershipCreated: true`.
- `autoUser` outcome `already-linked`: `ok: true`, `outcome: 'already-linked'` e `membershipCreated: false`.
- `autoUser` outcome `conflict`: `ok: false`, `outcome: 'conflict'`, `code: 'AUTO_USER_MEMBERSHIP_CONFLICT'`, `funcionarioLinked: false` e `legacyUserLinked: false`.
- Erro interno induzido no create: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Payload core observado
- O owner atual trimou `nome`, mas preservou `nome_social` com espaços externos no documento passado ao create.
- O owner atual lowercasou `email`, porém preservou os espaços externos no valor persistido observado do doc base.
- `observacoes` foi trimado antes do doc final.
- `carga_semanal: '44'` foi materializado como `44`.
- `salario_base: '1.234,56'` foi materializado como `1234.56`.
- Sem enviar arquivos nem JSONs auxiliares, o doc base observado seguiu com `anexos`, `dependentes` e `beneficios` vazios.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-create-core-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-create-core-runtime-contract.test.js`.
- Resultado final congelado: `10` testes passando.

## Observações importantes do runtime
- O cenário de sem sessão foi exercitado contra o app real montado, confirmando o gate `401` no endpoint.
- Os demais cenários foram congelados por harness focal carregado do source atual do controller, sem patch de produção, para isolar o residual do create core sem reabrir subfases já congeladas nem depender do bootstrap completo de banco desta linha de trabalho.
- Nos cenários positivos desse recorte, os logs do owner mantiveram `keys.files = []`, `anexos length bruto = 0` e `req.file? false`, coerentes com a proibição de abrir arquivos e JSONs auxiliares nesta rodada.
- O owner atual expõe uma assimetria observável no payload base: `nome_social` e `email` não saem trimados no doc persistido do create, embora `nome` e `observacoes` saiam trimados.
- O erro interno induzido continuou emitindo log do owner (`[API FUNCIONARIOS][create] Erro:`), mas o envelope HTTP observado permaneceu `500` com `Erro interno`.

## Decisão final
- Classificação: guardrail focal fechado para o residual core do create.
- Motivo: foi possível congelar apenas o núcleo base remanescente e os outcomes de `autoUser`, sem tocar produção e sem misturar foto, anexos, biometria ou JSONs de cadastro.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.