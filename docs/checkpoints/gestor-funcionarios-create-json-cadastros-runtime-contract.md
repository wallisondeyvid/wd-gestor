# Checkpoint: POST /gestor/api/funcionarios create json cadastros

## Escopo
- Subcorredor congelado: serialização consolidada de `dependentes_json` e `beneficios_json` em `POST /gestor/api/funcionarios`.
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`createFuncionario`).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado nesta rodada: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com serialização em `public/js/funcionarios/funcionarios_index.js`.

## Fronteira congelada
- Esta rodada congela apenas o recorte de `dependentes_json` e `beneficios_json` do owner `createFuncionario`.
- O recorte inclui: parse desses dois campos, normalização observável do CPF dos dependentes, persistência final no documento criado e envelopes de erro do create.
- O recorte exclui explicitamente: foto, anexos, biometria/capturas, `face_imagem`, `fp_capturas_json`, `face_capturas_json`, PUT full, PUT incremental, GETs, delete-post, match e disponíveis.
- O bloco `autoUser` permaneceu apenas como efeito inevitável do owner no caminho de sucesso, sem expansão de escopo para congelar o contrato inteiro de autoUser.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Unidade não encontrada'`.
- Sucesso com `dependentes_json` válido: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`.
- Sucesso com `beneficios_json` válido: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`.
- Sucesso com ambos válidos: `201` JSON com `success: true`, `created: true`, `id` no topo, `data.id` duplicando o identificador criado e `data.autoUser.ok === true`.
- Normalização observável do CPF dos dependentes: o create conclui com `201` e persiste o CPF do dependente sem máscara.
- `dependentes_json` inválido: o owner atual não responde erro; conclui o create com `201` JSON e persiste `dependentes` como array vazio.
- `beneficios_json` inválido: o owner atual não responde erro; conclui o create com `201` JSON e persiste `beneficios` como array vazio.
- Erro interno induzido no create desse recorte: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Persistência observada nos sucessos
- Quando `dependentes_json` contém array válido, o owner atual persiste `dependentes` com os campos recebidos, incluindo `nome`, `parentesco`, flags booleanas e `data_nascimento` materializada no documento.
- O CPF dos dependentes é normalizado depois do parse: valor formatado como `123.456.789-01` foi persistido como `12345678901`.
- Quando `beneficios_json` contém array válido, o owner atual persiste `beneficios` com `tipo`, `nome`, `cnpj_plano`, `tipo_valor`, `valor`, `inicio` e `data_inicio`.
- Quando os dois JSONs são enviados juntos, o owner atual persiste simultaneamente `dependentes` e `beneficios` no mesmo create, sem abrir ramos de arquivo.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-create-json-cadastros-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-create-json-cadastros-runtime-contract.test.js`.
- Resultado final congelado: `9` testes passando.

## Observações importantes do runtime
- Nos cenários exercitados, os logs do owner mostraram `keys.files = []`, `anexos length bruto = 0` e `req.file? false`, confirmando que o microcorte se sustentou sem `req.files`, sem foto e sem anexos.
- O tratamento de JSON inválido nesse recorte é silencioso: o owner converte para array vazio em vez de responder `400`.
- O caminho de sucesso inevitavelmente disparou `autoUser` e o fluxo de mailer do projeto; esse efeito foi apenas congelado como observável do owner atual, sem ampliar a rodada.
- O envelope de falha interna genérica do create permaneceu `Erro interno`, consistente com o checkpoint base do create.

## Decisão final
- Classificação: microcorte seguro.
- Motivo: foi possível congelar o contrato runtime de `dependentes_json` e `beneficios_json` do create com um recorte local, sem tocar em produção e sem abrir foto, anexos, biometria ou PUTs.

## Confirmação explícita
- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.