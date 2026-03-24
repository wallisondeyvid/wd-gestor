# Checkpoint: PUT /gestor/api/funcionarios/:id/incremental anexo

## Escopo
- Subcorredor congelado: ramo de anexos dentro de `PUT /gestor/api/funcionarios/:id/incremental`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`updateFuncionarioIncremental`)
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`
- Consumidor vivo relacionado: `public/gestor/js/modals/funcionario_detalhes.js` consome o shape persistido de `anexos` por meio da listagem carregada do funcionário e do download já congelado em GET anexo

## Boundary congelado
- Esta rodada congela apenas o append de `req.files.anexos` no owner incremental.
- O ramo de foto permanece fora do escopo e já está congelado em `gestor-funcionarios-incremental-foto-runtime-contract.md`.
- O corpo transversal sem arquivos continua fora desta rodada: campos básicos, CPF/PIS, salário e dados trabalhistas, dependentes e envelopes combinados desse caminho.
- As capturas biométricas e `face_imagem` também permanecem fora desta rodada.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Funcionário inexistente: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Funcionário não encontrado'`.
- Sucesso com upload de anexo: `200` JSON com `success: true` e `data: { updated: true }`.
- No sucesso com anexo existente, o owner atual concatena o novo descriptor ao array já persistido, sem substituir os itens anteriores.
- Falha interna induzida no `findOneAndUpdate` do tenant: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Falha ao atualizar funcionário'`.

## Persistência observada no sucesso
- O owner transforma o arquivo recebido em descriptor persistível via `mapFiles(...)`.
- O descriptor novo observado preserva `nome`, `mime`, `tamanho`, `caminho` e `data_upload`.
- O campo `caminho` foi observado no prefixo `uploads/`, compatível com o contrato já consumido pelo modal de detalhes e pelo download de anexo.
- O array final de `anexos` é montado por concatenação entre o que já existia no documento e os novos itens normalizados.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-incremental-anexo-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-incremental-anexo-runtime-contract.test.js`
- Resultado final congelado: `5` testes passando.

## Observações estruturais
- O ramo de anexos se sustentou como o menor subcorredor remanescente porque é local no owner e não exige abrir os blocos transversais de normalização de corpo sem arquivos.
- O restante do incremental continua maior e mais entrelaçado: validações de CPF/PIS, campos simples, salário/dados trabalhistas, dependentes e biometria compartilham o mesmo pipeline de `buildUpdateOpsFromBody`, filtragem por schema, proteção de requireds e envelopes finais do update.

## Classificação final
- Decisão: microcorte seguro.
- Motivo: o ramo de anexos é local, observável e compatível com o shape já consumido pelo corredor de detalhes, sem exigir patch de produção nem abertura da fase maior remanescente do incremental.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Apenas a suíte focal e este checkpoint foram criados nesta rodada.