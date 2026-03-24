# Checkpoint: PUT /gestor/api/funcionarios/:id/incremental foto

## Escopo
- Subcorredor congelado: ramo de mutação de foto dentro de `PUT /gestor/api/funcionarios/:id/incremental`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionarioIncremental`)
- Consumidor ativo confirmado: `public/gestor/js/modals/funcionario_detalhes.js`
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`

## Contrato runtime observado
- Sem sessão: `401` JSON de unauthorized emitido pelo `requireLogin`.
- Fora do escopo contextual: `404` JSON no shape de `notFound(...)` do corredor, sem alcançar o funcionário de outra unidade.
- Exclusão de foto com `excluir_foto=true`: `200` JSON com `success: true` e `data: { updated: true }`, removendo `foto` do documento.
- Upload de foto com arquivo válido e blob não configurado: `503` JSON com `success: false` e `error` textual informando que o blob não está configurado.
- Sucesso observável do subcorredor nesta rodada: preserva `data.updated === true` no caminho de exclusão de foto.
- Falha interna induzida no ramo realmente executado da foto: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Falha ao atualizar funcionário'`.

## Consumidor vivo principal
- O modal de detalhes chama o subcorredor para remover foto em `public/gestor/js/modals/funcionario_detalhes.js` com `excluir_foto=true`.
- O mesmo modal chama o subcorredor para upload/substituição de foto com `FormData` contendo `foto`.
- A tela `views/gestor/funcionarios/funcionarios_index.ejs` carrega esse modal diretamente.

## Evidência executável
- Suíte focal criada: `tests/gestor-funcionarios-incremental-foto-runtime-contract.test.js`
- Execução validada: `node --test .\tests\gestor-funcionarios-incremental-foto-runtime-contract.test.js`
- Resultado final: `6` testes passando.

## Decisão final
- Classificação: microcorte seguro.
- Motivo: o consumidor explícito do ramo de foto é único e vivo, o bloco do handler é local, e o contrato runtime montado ficou congelado sem necessidade de patch de produção.
- Não apareceu microrefactor de produção pequeno e claramente proporcional além do congelamento do contrato nesta rodada.