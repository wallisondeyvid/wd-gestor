# Upload de Anexos no Feedback (Widget + Gestor)

Este documento descreve como o upload de anexos (imagens) do sistema de Feedback funciona e como configurar corretamente para produção (Vercel) usando **Vercel Blob**.

## Visão geral

- O **widget de feedback** cria um feedback e, opcionalmente, envia **1 imagem** como anexo.
- O backend salva o feedback no MongoDB e o anexo é armazenado em **nuvem (Vercel Blob)** quando disponível.
- Em ambiente local/dev, se o Blob não estiver configurado, há **fallback para filesystem** (pasta `public/uploads/feedback/...`).
- Em produção (Vercel), **não** é recomendado gravar em disco (filesystem é efêmero/readonly), então o anexo deve ir para o Blob.

## Endpoints envolvidos (Gestor)

### 1) Criar feedback (texto)
- `POST /gestor/api/feedback`
- Requer login (sessão).
- Body (JSON ou form):
  - `tipo`: `bug|sugestao|duvida|critica|elogio|outro`
  - `mensagem`: texto do feedback
  - `contexto` (opcional): `{ url, timezone, user_agent, ... }`

Retorno (padrão):
- `ok: true`
- `id`: protocolo/ID do feedback

### 2) Anexar imagem ao feedback
- `POST /gestor/api/feedback/:feedbackId/anexo`
- Requer login (sessão).
- `multipart/form-data`
- Campo aceito (compatível com o widget):
  - `anexo` (prioritário)
  - `file`
  - `attachment`

Regras:
- Máximo: **1 arquivo**
- Tamanho máximo: **5MB**
- Tipos aceitos: `image/png`, `image/jpeg`/`image/jpg`, `image/webp`

Armazenamento:
- Produção/Vercel: envia para **Vercel Blob** e grava a URL pública no array `anexos` do Feedback.
- Local/dev: se o Blob falhar/não existir token, salva em `public/uploads/feedback/<id>/...`.

### 3) Listar meus feedbacks
- `GET /gestor/api/feedback/meus`

### 4) Detalhar meu feedback
- `GET /gestor/api/feedback/meus/:feedbackId`

### 5) Admin (Gestor) — excluir feedback
- `DELETE /gestor/api/gestor/feedback/:feedbackId`

Remoção de anexos:
- Best-effort para remover URLs do Blob (quando possível)
- Best-effort para remover pasta local `public/uploads/feedback/<id>` (se existir)

## Variáveis de ambiente (Vercel Blob)

O backend tenta usar, nesta ordem, a primeira variável de ambiente disponível:

1. `BLOB_READ_WRITE_TOKEN`
2. `WDGESTOR_DB_DADOS_READ_WRITE_TOKEN`
3. `VERCEL_BLOB_RW_TOKEN`

Se você tem **apenas** `WDGESTOR_DB_DADOS_READ_WRITE_TOKEN`, tudo certo: o upload de anexo do Feedback já usa essa variável.

> Dica: alguns projetos funcionam sem token se a Store do Blob estiver conectada ao projeto. Mesmo assim, definir o token reduz intermitências.

## Comportamento quando o Blob não está configurado

No endpoint de anexo (`POST /gestor/api/feedback/:id/anexo`):

- Em **produção (Vercel)**:
  - Se o Blob não estiver configurado/token ausente, responde:
    - HTTP `503`
    - `code: "BLOB_NOT_CONFIGURED"`
    - Mensagem: “Upload de anexo indisponível: configure o Vercel Blob (Store) ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN.”

- Em **dev/local**:
  - Se o Blob falhar, o endpoint tenta salvar em disco e seguir normalmente.

## Passo a passo — configurando na Vercel

1. Vercel → Project → **Storage**: conecte/ative o **Blob**.
2. Vercel → Project → Settings → **Environment Variables**:
   - Adicione `BLOB_READ_WRITE_TOKEN` (recomendado) **ou** use `WDGESTOR_DB_DADOS_READ_WRITE_TOKEN`.
   - Selecione os ambientes desejados (Preview/Production/etc).
3. Faça **Redeploy**.
4. Teste o widget:
   - Envie um feedback com imagem.
   - Confirme no detalhe/admin que `anexos[0].url` é uma URL do tipo `https://...public.blob.vercel-storage.com/...`.

## Troubleshooting

### Upload falha com 503 `BLOB_NOT_CONFIGURED`
- Confirme que a Store do Blob está conectada **ou** que o token foi definido.
- Garanta que a variável está presente no ambiente correto (Preview/Production).

### Upload falha intermitente
- Defina explicitamente o token (mesmo com Store conectada).
- Verifique permissões do token.

### Imagem não aparece no detalhe
- Verifique se o documento do feedback tem `anexos` preenchido.
- Confirme que a URL é pública e acessível.

## Arquivos relevantes

- Backend (Gestor): `src/modules/gestor/app/routes/feedbackApi.js`
- Widget (front): `public/js/feedback-widget.js`
- Gestor (admin/lista): `public/gestor/js/pages/feedback.js`
