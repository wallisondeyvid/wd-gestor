# Checkpoint: POST /gestor/unidades/:id/testar-banco

## Escopo
- Endpoint congelado: `POST /gestor/unidades/:id/testar-banco`
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/unidade.js`
- Consumer real de página confirmado em `src/modules/gestor/app/routes/pagesRouter.js` pelas páginas `/unidades` e `/editar-unidades/:id`
- Owner/runtime relido: `src/modules/gestor/app/controllers/unidadeController.js` (`testarBanco`, `ensureCanAccessUnidade`, `normalizeUnitId`, `isPrivilegedGestorUser`)

## Fronteira congelada
- Esta rodada congela apenas o microcorte de teste de conexão bancária por unidade.
- O recorte inclui: gate de sessão observado na rota real, lookup da unidade-alvo, validação contextual via `ensureCanAccessUnidade`, ramo `oauth2`, ramo HTTP genérico via `BankPort.callBankApi` e envelope de erro do owner.
- O recorte exclui explicitamente: CRUD base de unidades, logo/logo-inline, endpoint público, toggle-access, módulos por unidade, provisioning status/events/retry e qualquer patch de produção.

## Contrato runtime congelado
- Sem sessão no app real: `302` com redirect para `/login`.
- ID inválido sem validação explícita no owner atual: quando o lookup não resolve alvo, o endpoint conclui como `404` JSON `{ ok: false, message: 'Unidade não encontrada.' }`.
- Unidade inexistente: `404` JSON `{ ok: false, message: 'Unidade não encontrada.' }`.
- Fora do escopo contextual: `400` JSON `{ ok: false, message: 'Acesso à unidade não autorizado.' }`.
- Sucesso no caminho feliz `oauth2`: `200` JSON com `ok: true`, `message: 'Conexão com o banco testada com sucesso.'`, `detalhe: 'Token OAuth2 obtido com sucesso.'` e `resultado.tokenPreview` truncado para os 10 primeiros caracteres seguidos de `...`.
- Sucesso observável do fallback contextual quando a busca do cluster retorna vazio: o owner ainda autoriza o alvo da própria unidade por fallback de `findUnidadesById(scopedUnitId)` e responde `200` JSON com `ok: true`.
- Erro interno induzido no owner atual: `400` JSON com `{ ok: false, message: <mensagem original do erro> }`.

## Observações importantes do runtime
- O gate sem sessão deste corredor é redirect-based, não JSON-based: a rota usa `requireLogin` antes do owner e no runtime atual redireciona para `/login`.
- O owner atual não possui validação sintática explícita de `id`; o comportamento observável depende do resultado de `findUnidadeById(...)`.
- A validação de alvo contextual ocorre dentro do owner, depois do lookup da unidade, por `ensureCanAccessUnidade(...)`.
- O helper contextual atual tenta expandir o cluster da unidade principal; se essa expansão vier vazia, ele faz fallback para a própria `scopedUnitId`.
- O catch externo do owner atual não retorna `500`; no runtime observado desta linha de trabalho ele fecha em `400` com a mensagem original do erro capturado.

## Evidência executável
- Suíte focal: `tests/gestor-unidades-testar-banco-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-unidades-testar-banco-runtime-contract.test.js`
- Resultado final congelado: `7` testes passando.

## Decisão final
- Classificação: microcorte seguro fechado.
- Motivo: o endpoint tem owner local, consumer real já identificado, risco contextual específico e superfície pequena o suficiente para caracterização focal sem abrir o restante do corredor de unidades.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.