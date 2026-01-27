# Padrão de Respostas da API (Gestor)

## Objetivo
Uniformizar o formato das respostas JSON para facilitar consumo no front-end, logging e testes automatizados, reduzindo ambiguidade e eliminando divergências de chaves (`ok`, `error`, variações etc.).

## Formato Base

Sucesso (200):
```
{
  "success": true,
  "data": { ... },
  "meta": { ... } // opcional
}
```

Criado (201):
```
{
  "success": true,
  "created": true,
  "id": "<id-principal>",
  "data": { ... } // opcional (detalhes adicionais)
}
```

Erro de validação / requisição (400):
```
{
  "success": false,
  "error": "Mensagem descritiva",
  "code": "BAD_REQUEST",
  "campos": ["lista", "opcional"]
}
```

Não encontrado (404):
```
{
  "success": false,
  "error": "Recurso não encontrado",
  "code": "NOT_FOUND"
}
```

Não autorizado / sessão inválida (401):
```
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

Proibido / sem permissão (403):
```
{
  "success": false,
  "error": "Acesso negado",
  "code": "FORBIDDEN"
}
```

Erro interno (500):
```
{
  "success": false,
  "error": "Falha descritiva",
  "code": "SERVER_ERROR"
}
```

Timeout / dependência externa (exemplo Biometria 504):
```
{
  "error": "Timeout sem dados",
  "durationMs": 5021
}
```
(Endpoints especiais de streaming/captura podem manter resposta específica enquanto não totalmente integrados.)

## Helpers Disponíveis
Arquivo: `src/gestor/utils/apiResponse.js`
- `ok(res, data, meta?)`
- `created(res, id, extra?)`
- `badRequest(res, message, extras?)`
- `notFound(res, message?)`
- `serverError(res, err, opts?)`
- `missingFields(res, campos[])` (atalho para 400 de obrigatórios)

## Endpoints Padronizados
| Domínio | Status | Observações |
|---------|--------|-------------|
| Unidades | OK | Create=201, update/delete=200 |
| Funções | OK | Lista cluster / por unidade com `ok` |
| Setores | OK | |
| Recursos | OK | Validação placa antiga/Mercosul |
| Funcionários | OK | Incremental / completo / delete unificados |
| Usuários (API) | OK | Senha, criação e dados atuais envelopados |
| CNAE | OK | Paginação via `meta` |
| Biometria | Parcial | `listarDispositivos` e `diagnostico` padronizados; captura/sniff mantêm formato híbrido (timeout/status especiais) |
| Módulos | OK | CRUD migrado e padronizado |
| Debug | OK | session / whoami / lookup por email/cpf / test-unidades |
| User Admin | OK | toggle / update / delete -> respostas normalizadas |
| Misc (IBGE/Cluster) | OK | `/api/ibge` público; `/api/unidades/cluster` autenticado |

## Regras de Uso
1. Sempre retornar apenas **um** envelope por requisição (exceto streaming/captura especial).
2. Criar: usar `created()` (gera HTTP 201) — incluir `id`.
3. Validação: usar `badRequest()`; campos ausentes usar `missingFields()`.
4. Não encontrado: `notFound()`.
5. Erros inesperados: `serverError()` (log detalhado no servidor, mensagem neutra para o cliente se necessário).
6. Evitar expor stack trace no cliente (usar `opts.stack=true` apenas em ambiente de desenvolvimento se configurado via variável de ambiente futura).

## Boas Práticas Complementares
- Paginação: incluir objeto `meta` com `{ page, limit, total, pages }`.
- Operações idempotentes de update: retornar `{ updated:true }` em `data`.
- Exclusões: `{ deleted:true, id }`.
- Evitar repetir campos já presentes fora de `data` (ex: não duplicar `id`).
- Erros de permissão: diferenciar `UNAUTHORIZED` (não logado) de `FORBIDDEN` (logado sem direito).

## Permissões e Middleware

Middleware principal de sessão: `requireLogin`.
Middleware de autorização granular: `requireRole(['admin','diretor'], { allowMasterImplicit: true })`.

Regras atuais:
- `master` tem acesso implícito a todas as rotas protegidas por `requireRole` (quando `allowMasterImplicit` não é desativado).
- Rotas administrativas de usuário exigem pelo menos `admin` ou `master` (via `requireRole(['admin'])`).
- Ações sobre usuários com `role=master` só podem ser feitas por um usuário que seja realmente master (`req.user.isMaster` ou `role==='master'`).
- Endpoints públicos: `/api/ibge`.
- Endpoints sensíveis (ex: cluster de unidades, debug) requerem sessão válida.

Formato de erros de permissão:
```
401 { "success": false, "error": "Não autenticado", "code": "UNAUTHORIZED" }
403 { "success": false, "error": "Acesso negado", "code": "FORBIDDEN" }
```

Boas práticas futuras:
- Adicionar claims de escopo (ex: `scopes: ['usuarios:write']`).
- Centralizar política em um módulo `authzPolicy.js`.
- Adicionar testes específicos de tentativa de escalonamento de privilégios.

## Exemplo Antes/Depois (Funcionário - criação inicial)
Antes:
```
400 { "error": "Já existe um funcionário cadastrado com este CPF nesta empresa." }
201 { "success": true, "id": "..." }
```
Depois:
```
400 { "success": false, "error": "Já existe um funcionário cadastrado com este CPF nesta empresa.", "code": "BAD_REQUEST" }
201 { "success": true, "created": true, "id": "...", "data": { "id": "..." } }
```

## Próximos Passos (Opcional / Futuro)
- Feature flag para exigir header `X-API-Format: v2` antes de aplicar envelope em endpoints de streaming.
- Middleware global de normalização de erros.
- Testes automatizados de contrato (ex: usando supertest + vitest/jest) validando shape básico.
- Extensão de `apiResponse.js` para gerar objetos de paginação padrão.
 - Unificar política de roles (`isMaster` vs `role==='master'`).
 - Converter endpoints de compatibilidade POST delete -> uso consistente de DELETE em todos os formulários.
 - Expandir mapa IBGE para fonte externa oficial (cache em arquivo JSON).
 - Adicionar testes de autorização (FORBIDDEN vs UNAUTHORIZED) específicos.

## Transição
O frontend pode verificar `if(response.success === false)` para tratamento de erros. Em endpoints híbridos (Biometria captura/sniff) manter fallback atual até versão final.

---
Qualquer endpoint novo deve obrigatoriamente utilizar os helpers para manter consistência.

## Materiais (Naturezas e Bens)

Endpoints adicionados para cadastro e gestão de materiais (com escopo por usuário: `master/admin` vê tudo, `user/diretor` limitado à sua unidade e filhas):

- Naturezas de Materiais
  - GET `/condominios/api/materiais/naturezas/busca`
    - Filtros opcionais: `unidade`, `tipo`, `nome` (parcial)
    - Retorna lista com enriquecimento de unidade
  - POST `/condominios/api/materiais/naturezas`
    - Body: `{ unidade_id, tipo: 'Fixo'|'Móvel', nome }`
    - Conflito (409) se já existir (unidade_id, tipo, nome)
  - PUT `/condominios/api/materiais/naturezas/:id`
    - Atualiza campos com validação; 409 em duplicidade
  - DELETE `/condominios/api/materiais/naturezas/:id`

- Materiais (Bens)
  - GET `/condominios/api/materiais/busca`
    - Filtros opcionais: `unidade`, `tipo`, `natureza_id`, `serie`, `nome` (parcial via natureza)
    - Retorna cada item enriquecido com: `unidade`, `natureza`, `area_rotulo` (quando vinculado)
  - POST `/condominios/api/materiais`
    - Body mínimo:
      - `{ unidade_id, tipo: 'Fixo'|'Móvel', natureza_id }`
    - Campos adicionais aceitos: `{ serie, data_aquisicao, marca, modelo, num_serie, peso, cor, descricao, vinculo_area: { unidade_id, area_id }, foto, anexo }`
    - `foto` e `anexo` devem ser DataURL (base64). Tipos aceitos: imagem (foto) e `application/pdf` (anexo)
    - Conflito (409) se `serie` já existir na mesma `unidade_id` (quando preenchida)
  - PUT `/condominios/api/materiais/:id`
    - Atualiza campos; aceita substituição de `foto` e/ou `anexo`
  - DELETE `/condominios/api/materiais/:id`

### Flags de upload (diagnóstico)
As rotas de criação/edição retornam as flags abaixo para ajudar suporte e troubleshooting quando a infraestrutura de blob estiver indisponível:

- `foto_saved`: boolean — indica sucesso no upload da imagem
- `anexo_saved`: boolean — indica sucesso no upload do PDF
- `blob_tried`: boolean — tentou usar provedor de blob (ex.: Vercel Blob)
- `blob_failed`: boolean — a tentativa de blob falhou
- `blob_missing_token`: boolean — token de escrita do blob ausente

Observações:
- Quando `foto/anexo` não forem enviados, as flags podem estar ausentes ou `false`.
- Em indisponibilidade de banco (Mongo), os endpoints retornam `503 Service Unavailable` com `Retry-After`.

## Contratos de Locação (Habitações)

Campos no modelo `CondHabitacao` (novo formato, compatível com legado):
- `contrato_locacao`: objeto do contrato atual
  - `url`: string (link público do arquivo)
  - `nome`: string
  - `mime`: string (ex.: `application/pdf`, `image/png`)
  - `periodo`: `{ inicio: Date|null, fim: Date|null }`
  - `responsavel_morador_id`: ObjectId de `CondMorador` (opcional)
  - `vigencia_inicio`/`vigencia_fim`: campos legados (mantidos para compat)
- `contratos_locacao`: array de objetos no mesmo formato acima (histórico)

Normalização de datas: o backend aceita `periodo.inicio`/`periodo.fim` como `DD/MM/AAAA` ou ISO; converte para `Date` automaticamente.

Endpoints:
- PUT `/condominios/api/habitacoes/:id`
  - Aceita:
    - `contrato_locacao`: `{ nome?, file?(DataURL) | url?, mime?, periodo?, responsavel_morador_id? }`
      - Se `file` for enviado como DataURL, o backend faz upload (Vercel Blob) e preenche `url`+`mime`.
    - `contratos_locacao`: `[]` (opcional) — substitui a lista inteira; itens com `file` em DataURL também são processados e convertidos.
  - Comportamento: quando `contrato_locacao` é enviado isoladamente, o backend também faz `$push` para `contratos_locacao`.

- POST `/condominios/api/habitacoes/:id/contratos`
  - Adiciona um item à lista e atualiza `contrato_locacao` com o mesmo conteúdo.
  - Body: `{ nome?, file?(DataURL) | url?, mime?, periodo?, responsavel_morador_id? }`.
  - Resposta: `{ ok:true, habitacao, contrato_added }` com os dados normalizados.

Notas de upload:
- Tipos aceitos: PDF e imagens (`png`, `jpeg/jpg`, `webp`).
- Limites padrão ~2–4MB dependendo do endpoint.
- Flags de diagnóstico de blob são retornadas em atualizações de habitação (PUT). No POST de contratos, apenas o resultado normalizado é retornado.
