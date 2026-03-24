# Checkpoint: POST /gestor/api/funcionarios create biometria face_imagem

## Escopo
- Subcorredor congelado: subfase 2 biométrica facial do owner `POST /gestor/api/funcionarios`.
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`createFuncionario`, `parseDataUrl`, `uploadFacePreviewToBlob`, `mapBiometriasFaciaisToBlob`).
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`.
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`.
- Consumidor vivo principal observado: formulário principal em `views/gestor/funcionarios/funcionarios_index.ejs`, com hiddens biométricos em `views/gestor/funcionarios/abas/aba2_cadastros_biometricos.ejs` e envio do formulário em `public/js/funcionarios/funcionarios_index.js`.

## Fronteira congelada
- Esta rodada congela apenas a subfase 2 biométrica facial do create.
- O recorte inclui: `face_imagem`, `parseDataUrl`, o ramo pós-create condicionado por `biometrias_facial`, a tentativa de remapeamento via `mapBiometriasFaciaisToBlob`, o warning/catch local e o save adicional pós-create quando esse ramo entra.
- O recorte exclui explicitamente: `face_capturas_json`, `fp_capturas_json`, foto comum, anexos, `dependentes_json`, `beneficios_json`, PUT full, PUT incremental, GETs e outros endpoints.
- O bloco `autoUser` permaneceu apenas como efeito inevitável do owner no caminho de sucesso, sem expansão de escopo.

## Fato estrutural confirmado no owner atual
- O ramo facial pós-create não abre a partir de `face_imagem` sozinho.
- Para esse ramo entrar no runtime atual, o owner exige simultaneamente:
  - `Array.isArray(novo.biometrias_facial)`
  - `novo.biometrias_facial.length > 0`
  - `canUseBlob()` verdadeiro
- Como esta rodada proibiu envio de `face_capturas_json`, a caracterização do ramo foi feita apenas via patch local na suíte focal, injetando `biometrias_facial` no documento recém-criado sem alterar produção.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Unidade não encontrada'`.
- `face_imagem` com valor não data-url: o owner conclui com `201` JSON e persiste o valor original sem remapeamento.
- `face_imagem` com data-url e Blob indisponível: o owner conclui com `201` JSON e persiste o valor original sem remapeamento.
- `face_imagem` com data-url e falha induzida na tentativa de remapeamento facial: o owner conclui com `201` JSON, preserva `face_imagem` original, preserva `biometrias_facial[0].imagem` original e ainda executa save adicional quando o ramo entra.
- Tentativa controlada de remapeamento com `VERCEL=1`, `fetch` mockado e ramo facial forçado via harness: no runtime observado desta linha de trabalho, o owner conclui com `201`, entra no ramo pós-create, executa save adicional observável, mas persiste `face_imagem` e `biometrias_facial[0].imagem` ainda como data-url, sem URL Blob observável.
- Erro interno induzido no create desse recorte: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Persistência observada
- Quando o create é chamado apenas com `face_imagem`, o documento criado persiste `face_imagem` exatamente como enviada.
- Sob as tentativas controladas desta rodada, o documento permaneceu com `face_imagem` em data-url mesmo quando o ramo facial pós-create foi forçado e o save adicional aconteceu.
- Sob as mesmas tentativas controladas, `biometrias_facial[0].imagem` também permaneceu em data-url no documento persistido.
- O save adicional pós-create é observável apenas quando o ramo facial realmente entra; fora desse ramo, o create não apresentou esse save extra neste recorte.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-create-biometria-face-imagem-runtime-contract.test.js`.
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-create-biometria-face-imagem-runtime-contract.test.js`.
- Resultado final congelado: `10` testes passando.

## Observações importantes do runtime
- Esta rodada não enviou `face_capturas_json` nem `fp_capturas_json` no request HTTP.
- O owner atual tem um gate real entre `face_imagem` e o remapeamento Blob: sem `biometrias_facial` não há tentativa de remapeamento pós-create.
- No harness desta linha de trabalho, nem `VERCEL=1` com `fetch` mockado foi suficiente para produzir uma URL Blob persistida de forma honesta; o que apareceu de forma estável foi entrada no ramo com preservação da data-url.
- O caminho de sucesso inevitavelmente disparou `autoUser` e o fluxo de mailer do projeto; esse efeito foi apenas congelado como observável do owner atual, sem ampliar a rodada.

## Decisão final
- Classificação: subfase 2 do create biométrico congelada como guardrail focal seguro.
- Motivo: foi possível congelar o contrato runtime real de `face_imagem` e do ramo facial pós-create sem tocar produção e sem inventar um sucesso de remapeamento Blob que o runtime desta linha de trabalho não materializou de forma observável.

## Confirmação explícita
- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.
