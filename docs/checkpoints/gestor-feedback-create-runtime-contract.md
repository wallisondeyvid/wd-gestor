# Checkpoint: Gestor Feedback Create Runtime Contract

## Snapshot

- corredor: POST /gestor/api/feedback
- owner vivo: src/modules/gestor/app/controllers/feedbackCreateApiController.js
- borda: requireLogin -> requireUnitScope em src/modules/gestor/app/routes/feedbackApi.js
- costura real de criação observada: owner -> processCreateFeedbackCore -> createFeedback(data, { scopedUnitId })
- suíte focal: tests/gestor-feedback-create-runtime-contract.test.js
- execução validada: node --test .\tests\gestor-feedback-create-runtime-contract.test.js

## Contrato runtime observado

- sem sessão: 401 JSON de não autenticado
- criação contextual em sucesso: 200 JSON com created=true, id preenchido e documento criado
- o documento criado recebe status `novo`
- o documento criado recebe `unidade_id` igual à unidade ativa do contexto
- mensagem vazia: 400 JSON `Mensagem é obrigatória.`
- mensagem acima de 4000: 400 JSON `Mensagem deve ter no máximo 4000 caracteres.`
- tipo inválido: 400 JSON `Tipo inválido.`
- tipo explícito é normalizado no contrato observado
- inferência de módulo respeita a precedência `module > contexto.url > referer`

## Tenant enforcement observado

- o POST canônico widget recebe unitScope pela borda requireUnitScope
- o owner propaga `scopedUnitId` para processCreateFeedbackCore
- a core delega a persistência para `createFeedback(data, { scopedUnitId })`
- a persistência injeta `unidade_id` a partir do contexto ativo antes de salvar

## Fora do recorte

- upload, meus, listagem admin, detail admin, status, resposta e delete permaneceram fora deste recorte
- nenhum alias admin foi aberto neste microcut
- nenhum controller legado foi tocado

## Resultado do microcut

- o corredor POST canônico widget create ficou congelado com prova runtime focal independente do contrato integrado grande
- a produção permaneceu inalterada neste recorte
- o delta deste microcut ficou restrito a:
  - tests/gestor-feedback-create-runtime-contract.test.js
  - docs/checkpoints/gestor-feedback-create-runtime-contract.md