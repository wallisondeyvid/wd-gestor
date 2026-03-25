# Checkpoint: Gestor Unidades Logo Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- `GET /gestor/api/unidades/:id/logo`
- `POST /gestor/api/unidades/:id/logo`
- `POST /gestor/api/unidades/:id/logo-inline`

Sem reabrir:

- CRUD base de unidades
- endpoint público
- toggle-access
- módulos por unidade
- provisioning
- testar-banco

## Arquivo focal

- Suíte: `tests/gestor-unidades-logo-runtime-contract.test.js`

Comando validado:

```powershell
node --test .\tests\gestor-unidades-logo-runtime-contract.test.js
```

Resultado observado: 9 testes passando, 0 falhando.

## Contrato runtime observado

### Autenticação sem sessão no app real

Os três endpoints de API de logo respondem `401` em JSON, não `302` para `/login`:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

Isso vale para:

- `GET /gestor/api/unidades/:id/logo`
- `POST /gestor/api/unidades/:id/logo`
- `POST /gestor/api/unidades/:id/logo-inline`

### Escopo contextual

`getUnidadeLogo` chama `ensureCanAccessUnidade(req, id)` antes de carregar a unidade alvo.

Quando a unidade pedida não pertence ao cluster acessível do `unitScope`, o retorno observado é:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Acesso à unidade não autorizado."
}
```

Status: `400`.

### Unidade inexistente

Quando o alvo é permitido pelo contexto mas o lookup final não encontra a unidade, `getUnidadeLogo` responde:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

Status: `404`.

### Leitura do logo já persistido

Quando `unidade.logo` contém URL pública HTTP/HTTPS, o contrato atual de `getUnidadeLogo` é redirecionar para essa URL.

Comportamento congelado:

- status `302`
- header `Cache-Control: public, max-age=60`
- `Location` apontando para a URL persistida

Isso representa o formato atual esperado para logos persistidos via Blob.

### Upload bem-sucedido

No caminho feliz observado de `uploadLogoUnidadeInline`:

- aceita `dataUrl` de imagem válida em JSON
- reprocessa a imagem para WebP
- envia ao Blob com chave no formato `unidades/<id>/uuid-logo-test.webp`
- persiste a URL pública retornada em `unidade.logo`
- responde `200`

Payload observado:

```json
{
  "success": true,
  "data": {
    "uploaded": true,
    "logo": "https://blob.vercel-storage.com/unidades/u-filial/logo-final.webp"
  }
}
```

### Ambiente sem suporte a Blob/persistência

No ramo JSON compatível de `uploadLogoUnidade`, quando não há ambiente Vercel nem token de Blob configurado, o helper `_processarEEnviarParaBlob` falha com `BLOB_NOT_CONFIGURED` e o handler traduz para `400`.

Payload observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Blob não configurado (conecte a Store no Vercel OU defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)"
}
```

### Erro interno induzido

Em `uploadLogoUnidadeInline`, quando a persistência lança erro genérico diferente de `BLOB_NOT_CONFIGURED`, o handler cai no `catch` externo e responde `500`.

Payload observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-logo-inline-failure"
}
```

## Observações de implementação congeladas

- `GET /logo` faz a validação de escopo antes do lookup final da unidade alvo.
- Logo persistido como URL pública é servido por redirecionamento, não por proxy binário.
- Os uploads atuais normalizam para Blob URL pública; o checkpoint não congela o fluxo legado de Data URL/disco, apenas o contrato testado do subcorredor aberto.
- Para esse corredor, o comportamento de autenticação é de API JSON `401`, diferente do microcorte anterior de `testar-banco` que era rota de página e redirecionava para `/login`.