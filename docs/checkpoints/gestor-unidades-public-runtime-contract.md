# Checkpoint: Gestor Unidades Public Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- `GET /gestor/api/public/unidades/:id`

Sem reabrir:

- CRUD base de unidades
- logo/logo-inline
- toggle-access
- módulos por unidade
- provisioning status/events/retry
- testar-banco

## Arquivo focal

- Suíte: `tests/gestor-unidades-public-runtime-contract.test.js`

Comando validado:

```powershell
node --test .\tests\gestor-unidades-public-runtime-contract.test.js
```

Resultado observado: 8 testes passando, 0 falhando.

## Contrato congelado

### 1. Snapshot e wiring observado

Na rota autorizada, o endpoint está definido como:

```js
router.get('/api/public/unidades/:id', getUnidadePublic);
```

Sem `requireLogin` no arquivo de rota lido.

Apesar disso, no app real sem sessão, a chamada observada para `GET /gestor/api/public/unidades/id-invalido` respondeu `401` JSON:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

O contrato congelado deve seguir o runtime real observado, não a intenção aparente do arquivo de rota isolado.

### 2. ID inválido

No owner atual, quando o `id` está ausente ou vazio, o retorno é `400` com:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "ID da unidade é obrigatório."
}
```

### 3. Unidade inexistente

Quando `findUnidadeByIdLean(id)` não encontra a unidade, o retorno é `404` com:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada."
}
```

### 4. Acesso público no caminho feliz observado

No owner `getUnidadePublic`, não há leitura de `req.user` nem validação contextual de `unitScope`.

No caminho feliz observado no owner, o payload retorna `200` com envelope:

```json
{
  "success": true,
  "data": {
        "_id": "u-publica",
        "nome": "Clinica Alpha",
        "razaoSocial": "Clinica Alpha LTDA",
        "endereco": "Rua 1",
        "telefone": "1199998888",
        "emailPrincipal": "contato@alpha.test",
        "banco": "001",
        "agencia": "1234",
        "contaCorrente": "99999-0",
        "pixChave": "pix@alpha.test",
        "tipoPix": "email",
        "is_principal": true,
        "subunidade": false,
        "logoUrl": "/api/unidades/u-publica/logo"
  }
}
```

### 5. Shape real do payload devolvido

O owner expõe apenas um subconjunto público dos campos da unidade:

- `_id`
- `nome`
- `razaoSocial`
- `endereco`
- `telefone`
- `emailPrincipal`
- `banco`
- `agencia`
- `contaCorrente`
- `pixChave`
- `tipoPix`
- `is_principal`
- `subunidade`
- um dos campos de logo (`logoUrl` ou `logoDataUrl`)

Campos internos não observados no payload público do owner, mesmo quando presentes no documento de origem:

- `apiBancaria`
- `cnpj`

### 6. Comportamento quando logo_url existe

Há dois comportamentos reais observados:

- Se `unidade.logo` já for URL HTTP/HTTPS pública, o owner devolve:

```json
{
  "logoUrl": "https://cdn.example.test/logo.webp"
}
```

- Se `unidade.logo` existir mas não for URL HTTP nem Data URL, o owner normaliza para:

```json
{
  "logoUrl": "/api/unidades/<id>/logo"
}
```

### 7. Comportamento quando logo_url não existe

Quando `unidade.logo` está ausente, o owner devolve explicitamente:

```json
{
  "logoUrl": null
}
```

### 8. Eventual filtro/sanitização real do owner

Transformações observadas:

- `telefone` prioriza `telefoneCelular` e cai para `telefoneFixo` se necessário
- `is_principal` é normalizado para boolean com `!!`
- `subunidade` é normalizado para boolean com `!!`
- campos textuais públicos fazem fallback para string vazia
- quando a logo persistida é Data URL, o owner usa `logoDataUrl` e não `logoUrl`

### 9. Erro interno induzido

Quando `findUnidadeByIdLean` lança erro, o owner cai no `catch` e responde `500` com a mensagem original:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-get-public-failure"
}
```

## Observações importantes do runtime

- Há divergência entre a leitura da rota autorizada e o comportamento observado no app real sem sessão: o arquivo de rota sugere endpoint público, mas o runtime observado respondeu `401`.
- O owner em si continua pequeno, sem `req.user` e sem `unitScope`, então a restrição parece vir do wiring real mais alto do app, não do handler lido nesta rodada.
- O contrato público não devolve `logo` cru; ele transforma para `logoUrl` ou `logoDataUrl`, conforme o formato persistido.
- O payload do owner é explicitamente reduzido a um subconjunto de campos públicos e não espelha o documento completo da unidade.

## Decisão final

- Classificação: microcorte fechado com guardrail focal.
- Motivo: o endpoint e seu owner foram caracterizados com suíte isolada, incluindo a divergência crítica entre rota aparente e runtime real.

## Confirmação explícita

- Produção não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.