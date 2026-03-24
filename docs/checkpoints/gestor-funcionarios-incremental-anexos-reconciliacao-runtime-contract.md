# Checkpoint: PUT /gestor/api/funcionarios/:id/incremental anexos reconciliacao

## Escopo
- Subcorredor congelado: reconciliação de `anexos_existentes` e `anexos_excluidos` no owner `PUT /gestor/api/funcionarios/:id/incremental`.
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionarioIncremental` + `buildUpdateOpsFromBody`).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado nesta rodada: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com coleta de anexos em `views/gestor/funcionarios/abas/aba7_observacoes.ejs` e submit real via `public/js/funcionarios/funcionarios_index.js`.

## Fronteira congelada
- Esta rodada congela apenas o comportamento do owner incremental quando a edição principal envia `anexos_existentes`, `anexos_excluidos` e, opcionalmente, upload novo em `req.files.anexos`.
- O recorte inclui: geração desses campos no consumer principal, passagem deles no request real de edição, `skip` explícito em `buildUpdateOpsFromBody`, concatenação de upload novo com `funcionario.anexos` e envelope final do incremental.
- O recorte exclui explicitamente: foto, biometria, `dependentes_json`, `beneficios_json`, PUT full, create, refactor e qualquer patch de produção.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Unidade não encontrada'`.
- Funcionário inexistente: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Envio apenas de `anexos_existentes`: `200` JSON com `success: true` e `data: { updated: true }`, sem reconciliação material de anexos no owner incremental.
- Envio apenas de `anexos_excluidos`: `200` JSON com `success: true` e `data: { updated: true }`, sem reconciliação material de anexos no owner incremental.
- Envio combinado de `anexos_existentes` + `anexos_excluidos`: `200` JSON com `success: true` e `data: { updated: true }`, sem reconciliação material de anexos no owner incremental.
- Envio combinado de `anexos_existentes` + `anexos_excluidos` + upload novo em `req.files.anexos`: `200` JSON com `success: true` e `data: { updated: true }`; o owner concatena apenas o anexo novo sobre `funcionario.anexos` já persistido.
- Erro interno induzido no update: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Falha ao atualizar funcionário'`.

## Consumo real observado no owner incremental
- `buildUpdateOpsFromBody` faz `skip` explícito de `anexos_existentes` e `anexos_excluidos`.
- Depois da montagem inicial de `ops`, o owner incremental ainda remove qualquer caminho `anexos` vindo de `$set` ou `$unset` do body.
- O único ramo material de anexos no incremental deste recorte é `req.files.anexos`, que passa por `mapFiles(...)` e concatena o resultado com `funcionario.anexos`.

## Persistência observada
- Quando o request traz só `anexos_existentes`, `anexos_excluidos` ou ambos, o owner incremental chama o update com `ops` vazios: `$set: {}` e `$unset: {}`.
- Quando há upload novo, o owner incremental ignora os descriptors enviados em `anexos_existentes`, ignora os itens listados em `anexos_excluidos` e monta `ops.$set.anexos` a partir de `funcionario.anexos.concat(anexosNovos)`.
- No runtime observado, isso preserva integralmente os anexos já persistidos do funcionário e apenas acrescenta o novo descriptor no fim.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-incremental-anexos-reconciliacao-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-incremental-anexos-reconciliacao-runtime-contract.test.js`.
- Resultado final congelado: `8` testes passando.

## Observações importantes do runtime
- O submit real da edição principal redireciona para o incremental; portanto este microcorte incide sobre o caminho efetivamente usado pela tela.
- Nos cenários com `anexos_existentes`, o owner registrou apenas o debug `anexos_existentes strlen`, sem qualquer parse material equivalente ao PUT full.
- Nos cenários sem upload novo, o snapshot de ops do incremental ficou vazio: `set: []`, `unset: []`.
- No cenário com upload novo, os logs observáveis foram `files keys: [ 'anexos' ]`, `novos anexos normalizados: 1` e `anexos total após concat: 3`.
- O owner incremental atual não implementa reconciliação de `anexos_existentes` e `anexos_excluidos`; ele apenas aceita upload novo e concatena sobre `funcionario.anexos`.

## Decisão final
- Classificação: microcorte seguro fechado.
- Motivo: foi possível congelar exatamente o runtime real do incremental no ponto em que a edição principal envia `anexos_existentes` e `anexos_excluidos`, sem corrigir o comportamento e sem tocar produção.

## Confirmação explícita
- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.