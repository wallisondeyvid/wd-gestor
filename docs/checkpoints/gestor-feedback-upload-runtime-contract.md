# Checkpoint: Gestor Feedback Upload Runtime Contract

## Snapshot

- corredor: POST /gestor/api/feedback/:feedbackId/anexo
- owner vivo: src/modules/gestor/app/controllers/feedbackUploadApiController.js
- borda: requireLogin -> requireUnitScope -> uploadFeedbackAnexoMiddleware em src/modules/gestor/app/routes/feedbackApi.js
- costura real de upload observada: owner -> findFeedbackById(feedbackId, { scopedUnitId, allowLegacyUnscoped: true }) -> feedbackPolicy.ensureCreatorOwnership -> uploadStorageInfra.processUpload -> saveFeedbackDoc
- suíte focal: tests/gestor-feedback-upload-runtime-contract.test.js
- execução validada: node --test .\tests\gestor-feedback-upload-runtime-contract.test.js

## Contrato runtime observado

- sem sessão: 401 JSON de não autenticado
- upload em sucesso para feedback do criador no escopo: 200 JSON com anexo persistido no documento
- o anexo persistido recebe URL pública local compatível com /gestor/uploads/feedback/* no contrato observado
- a URL pública do anexo fica acessível por GET após o upload
- feedback do mesmo criador fora da unidade ativa: 404 JSON Feedback não encontrado sem mutação de anexos
- id malformado: 400 JSON ID inválido
- arquivo ausente: 400 JSON Arquivo ausente
- mime inválido na borda do multer: 400 JSON Tipo de arquivo inválido

## Tenant enforcement observado

- o POST canônico widget recebe unitScope pela borda requireUnitScope
- o owner propaga `scopedUnitId` para `findFeedbackById` com `allowLegacyUnscoped: true`
- a leitura contextual fora da unidade ativa é traduzida para 404 antes da anexação
- a mutação de anexos só ocorre após leitura contextual válida, ownership autorizado e storage concluído

## Fora do recorte

- create, meus, listagem admin, detail admin, status, resposta e delete permaneceram fora deste recorte
- nenhum alias admin foi aberto neste microcut
- nenhum controller legado foi tocado

## Resultado do microcut

- o corredor POST canônico widget upload ficou congelado com prova runtime focal independente do contrato integrado grande
- a produção permaneceu inalterada neste recorte
- o delta deste microcut ficou restrito a:
  - tests/gestor-feedback-upload-runtime-contract.test.js
  - docs/checkpoints/gestor-feedback-upload-runtime-contract.md