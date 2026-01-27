# Upload de Fotos no módulo Condomínios (Habitações)

Este documento descreve como o upload de fotos das Habitações funciona no projeto e como configurar as variáveis de ambiente necessárias quando estiver rodando em produção (Vercel) ou localmente.

## Visão geral

- O frontend envia a imagem selecionada como Data URL (base64) no campo `foto` para os endpoints do módulo Condomínios.
- O backend converte o Data URL em buffer e faz o upload para o Vercel Blob, salvando a URL pública no campo `foto` do documento da Habitação (MongoDB).
- Se o upload estiver indisponível, a criação/edição da Habitação continua sem foto e o backend devolve flags para que o frontend avise o usuário.

## Endpoints envolvidos

- Criar habitação: `POST /condominios/api/habitacoes`
- Atualizar habitação: `PUT /condominios/api/habitacoes/:id`
- Buscar habitações (lista enriquecida): `GET /condominios/api/habitacoes/busca`

Os endpoints de POST/PUT aceitam um JSON com os campos da habitação. Se houver uma imagem selecionada no formulário, o front envia `foto` como Data URL, por exemplo:

```json
{
  "unidade_id": "<id da unidade>",
  "numero": "Casa 001",
  "tipo": "Casa",
  "bloco_id": "<id opcional>",
  "andar_id": "<id opcional>",
  "area_m2": 80,
  "fracao_ideal": 1,
  "descricao": "Frente norte",
  "foto": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ..."
}
```

## Variáveis de ambiente suportadas (token do Blob)

O módulo tenta usar, nesta ordem, a primeira variável de ambiente disponível:

1. `BLOB_READ_WRITE_TOKEN`
2. `WDGESTOR_DB_DADOS_READ_WRITE_TOKEN`
3. `VERCEL_BLOB_RW_TOKEN`

Caso nenhuma esteja definida e sua implantação não esteja com a Store do Blob conectada automaticamente, o SDK do Blob retornará erro “No token found” e o backend irá:

- Prosseguir sem salvar a foto (campo `foto` ficará vazio)
- Incluir `blob_missing_token: true` e `blob_failed: true` na resposta JSON

### Remoção de foto anterior (opcional)

- `ENABLE_DELETE_OLD_BLOB=1`: se definido, ao atualizar a foto o sistema tentará remover o arquivo anterior do Vercel Blob. O mesmo token acima é reutilizado para exclusão.

## Flags de resposta do backend (POST/PUT)

Os endpoints retornam o documento salvo e campos auxiliares para o front reagir:

- `foto_saved` (boolean): indica se o campo `foto` ficou com uma URL válida.
- `blob_enabled` (boolean): indica que o SDK está acessível no runtime.
- `blob_tried` (boolean): indica que o backend tentou subir a imagem nesta requisição.
- `blob_failed` (boolean): indica que a tentativa de upload falhou.
- `blob_missing_token` (boolean): indica que a falha ocorreu por ausência de token.

## Passo a passo – configurando na Vercel

1. Acesse o projeto na Vercel → Settings → Environment Variables.
2. Adicione uma das variáveis suportadas com o token de leitura/gravação do Blob (recomenda‑se `BLOB_READ_WRITE_TOKEN`).
3. Salve e redeploy o projeto.
4. Opcional: defina `ENABLE_DELETE_OLD_BLOB=1` para permitir remoção da foto antiga ao atualizar.

> Dica: alguns ambientes têm a Store do Blob conectada automaticamente e podem funcionar sem token; ainda assim, incluir o token evita intermitências.

## Recomendações de imagem

- Formatos aceitos: `image/png`, `image/jpeg`/`image/jpg`, `image/webp`.
- Tamanho máximo aceito pelo endpoint: ~2 MB para o Data URL recebido.
- Prefira imagens até ~1200×1200 px e qualidade moderada para reduzir latência de upload.

## Solução de problemas

- Toast “Upload de imagem indisponível: configure BLOB_READ_WRITE_TOKEN.”
  - Confirme que uma das variáveis suportadas está definida para os ambientes (Development/Preview/Production) e publique novamente.
- A foto não aparece na edição/modal após salvar
  - Verifique se a resposta do POST/PUT retornou `foto_saved: true`.
  - Se `blob_failed` ou `blob_missing_token` forem verdadeiros, o upload falhou.
- Remoção de foto antiga não funciona
  - Defina `ENABLE_DELETE_OLD_BLOB=1` e verifique se o token também permite exclusão.

## Como o front usa as flags

O formulário de “Estruturar → Habitações” exibe avisos quando:
- O upload falha por falta de token (`blob_missing_token: true`).
- A foto foi enviada, mas não foi salva (`foto_saved: false`).

Além disso, ao abrir uma habitação para edição, se não houver foto, o formulário mostra a miniatura vazia e oferece o botão “Remover foto” quando apropriado.

## Alterações internas relevantes

- `src/modules/condominios/app/condominios-app.js`
  - POST/PUT `/api/habitacoes`: upload para Blob com suporte às variáveis acima e flags de retorno.
  - GET `/api/habitacoes/busca`: retorna o campo `tipo` e demais dados enriquecidos usados pelo front.
- `public/js/condominios/cadastrar_habitacao.js`
  - Envia Data URL quando há arquivo selecionado e trata os avisos conforme as flags da resposta.

## Perguntas frequentes

- Posso enviar uma URL direta no lugar do Data URL?
  - Sim, no `PUT` aceitamos uma URL `http(s)` direta para `foto` (caso de migrações). No `POST`, o fluxo padrão é Data URL para upload.
- O upload funciona localmente?
  - Sim, desde que um dos tokens esteja definido no seu ambiente local, ou que seu projeto esteja com a Store do Blob conectada.
