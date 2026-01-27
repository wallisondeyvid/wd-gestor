# Auditoria — Caixa de Mensagens (Portal do Morador x Gestão)

## Escopo

Este relatório cobre o fluxo **Nova mensagem** (envio + anexos) e pontos de consistência/autorização entre:

- **Portal do Morador** (`/portal-morador/...`)
- **Gestão/Condomínios** (`/condominios/...`, `/gestor/...`)

Foco: consistência de comportamento, segurança de escopo/identidade, dependências “em nuvem” e UX de erros.

## Componentes (onde está o código)

- Frontend (JS compartilhado): `public/js/condominios/caixa_de_mensagem.js`
- Backend (API): `src/modules/condominios/app/condominios-app.js`

## Fluxo “Nova mensagem” (alto nível)

1. UI carrega o JS compartilhado e renderiza o compose.
2. Ao enviar, o browser faz **POST multipart/form-data** para `POST /api/msg/messages`:
   - Campo `payload`: JSON serializado (assunto, body, destinatários, etc.)
   - Campo `anexos`: arquivos (até 15)
3. Backend valida autenticação, DB, permissões e escopo Portal vs Gestão.
4. Backend cria o documento da mensagem (Mongo) e, se houver anexos, faz upload no **Vercel Blob**.
5. Backend retorna `201 { ok: true, id, protocolo }`.

---

## 1) Auditoria do endpoint de envio — `POST /api/msg/messages`

### Formatos aceitos
- **multipart/form-data**: esperado quando há anexos (sempre passa `payload` string JSON).
- (fallback) `req.body` JSON quando não for multipart.

### Campos do payload (principais)
- `fromMailboxId` (default: `pessoal`)
- `fromMailboxName` (label para UI)
- `to`, `cc` (listas de destinatários; normalizadas por `sanitizeGroupMembers`)
- `assunto`
- `bodyHtml`, `bodyText` (backend exige `bodyText` não-vazio)
- `assinaturaAtiva`, `assinaturaTexto`
- `clientNonce` (idempotência)
- Threading: `threadRootId`, `inReplyToId`, `forwardedFromId` (ObjectId válidos)

### Validações de entrada
- `to.length > 0`
- `assunto` obrigatório
- `bodyText` obrigatório
- `clientNonce` truncado em 120 chars

### Autorização e escopo
- Exige usuário autenticado.
- Exige Mongo pronto (senão `503` e `Retry-After: 5`).
- Se `fromMailboxId !== pessoal`:
  - `canAccessMsgMailbox(mailbox, ctxUser, req)`
  - `mailboxCanSendMessage(mailbox, ctxUser)` (a não ser que seja admin/scopeAll)
- Se `fromMailboxId === pessoal`:
  - exige **chave estável por e-mail** (não permite enviar sem conseguir determinar um e-mail)

### Regra crítica (Portal): header `x-wdg-portal: 1`
Quando `x-wdg-portal: 1`:
- O backend restringe destinatários ao **conjunto de unidades/subunidades** do usuário.
- Isso mitiga o risco “mesmo navegador com sessão do Gestor + Portal”, evitando que o Portal envie para destinatários fora do condomínio.

Implementação (resumo):
- Obtém `unitIds` via `listarUnidadesParaUsuario(ctxUser)`.
- Monta `allowedEmails` consultando `User` e `CondUsuario` por `unidade_id`.
- Valida `to`/`cc`:
  - `type: mailbox` → mailbox precisa estar em `allowedUnitIds`
  - `type: user` → `email` precisa estar em `allowedEmails`

Observação importante:
- Se não conseguir determinar `allowedUnitIds`, bloqueia com `403` (fail-safe).

### Idempotência (anti-duplo-clique / retry)
- Se `clientNonce` presente:
  - Procura mensagem existente por `(from_owner, from_mailbox_id, client_nonce)`.
  - Se encontrar, retorna `200 { ok: true, id, protocolo, deduped: true }`.
  - Em corrida de índice duplicado (E11000), tenta resolver e retornar o existente.

### Anexos
- Middleware `multer.memoryStorage()` com:
  - `files: 15`
  - `fileSize: 10MB` (por arquivo)
- No handler:
  - Limite adicional de **10MB total** (soma dos anexos)

Persistência:
- Upload para **Vercel Blob** via `@vercel/blob`.
- Tokens aceitos:
  - `BLOB_READ_WRITE_TOKEN` (preferencial)
  - `VERCEL_BLOB_RW_TOKEN`
  - `WDGESTOR_DB_DADOS_READ_WRITE_TOKEN` (legado/alias)
- Se houver anexos e não estiver na Vercel e não houver token, retorna `400`.

Acesso/cache:
- `access: 'public'`
- `cacheControl: public, max-age=31536000, immutable`

### Melhorias aplicadas nesta auditoria (anexos)
Para reduzir blobs órfãos e permitir limpeza posterior:
- `anexos[].caminho` agora é preenchido com `uploaded.pathname` (ou fallback para a `key`).
- Em falha parcial durante upload, faz **cleanup best-effort** dos blobs já enviados quando `ENABLE_DELETE_OLD_BLOB=1`.
- Se falhar ao persistir `doc.anexos` no Mongo, também tenta remover blobs recém enviados quando `ENABLE_DELETE_OLD_BLOB=1`.

### Respostas
- `201` sucesso: `{ ok: true, id, protocolo }`
- `200` dedupe: `{ ok: true, id, protocolo, deduped: true }`
- `400/403/401` conforme validações
- `503` quando DB indisponível (com `Retry-After`)

---

## 2) Auditoria de anexos e “nuvem” (Vercel Blob)

### Dependência cloud
- Hoje os anexos são **cloud-only** (Vercel Blob). Não há fallback para filesystem local.

### Riscos e pontos de atenção
- **Acesso público** (`access: public`): URL do anexo pode ser aberta fora do app.
- **Cache agressivo** (`immutable`): após vazamento da URL, é difícil “revogar” sem deletar o blob.
- **Orfandade de blobs**:
  - Se o upload for parcial e a request falhar, blobs podem ficar sem referência no Mongo.
  - Se a mensagem ficar `ativo=false` (exclusão definitiva por states vazios), o blob pode continuar acessível.

### Limpeza (lifecycle)
- Retenção automática move estados para lixeira e remove states antigos, mas **não remove blobs**.
- Ações de “exclusão definitiva” também não removiam blobs.

### Melhorias aplicadas nesta auditoria (cleanup)
Controlado pela flag `ENABLE_DELETE_OLD_BLOB=1`:
- Em `POST /api/msg/messages/actions` quando `action=delete` e a mensagem fica `ativo=false`, tenta remover `anexos[].url`/`caminho` do Blob.
- Em `DELETE /api/msg/mailboxes/:id`, quando mensagens são removidas do banco por ficarem sem states, tenta remover seus anexos do Blob antes do `deleteMany`.

### Recomendações (próximos passos)
- Tornar anexos **privados** e servir via endpoint autenticado (ou URLs assinadas), se o modelo de produto exigir confidencialidade.
- Implementar uma rotina de “garbage collection” para mensagens `ativo=false` com anexos e sem states, caso o banco acumule muitos documentos.
- (Opcional) adicionar allowlist de MIME/extensões e validação de conteúdo.

---

## 3) Auditoria de erros e UX (frontend)

### Envio
- O compose usa `FormData` com `payload` + `anexos` e faz `fetch(POST /api/msg/messages)`.
- Headers importantes:
  - `Accept: application/json`
  - `X-Requested-With: fetch`
  - No Portal: `x-wdg-portal: 1`
- Em erro:
  - Mostra `alert-danger` com mensagem do backend (`json.error`) ou fallback.
  - Reabilita botão e libera flag anti-duplo-envio.

### Pontos de UX (recomendado)
- Quando `503` (DB indisponível), considerar exibir mensagem com sugestão de retry e/ou ler `Retry-After`.
- Em resposta `deduped: true`, a UI pode mostrar “Mensagem já enviada (evitado reenvio)”.

---

## 4) Tabela comparativa — Portal vs Gestão

| Tema | Portal do Morador | Gestão/Condomínios | Observações |
|---|---|---|---|
| Base path | `/portal-morador` | `/condominios` / `/gestor` | JS resolve base por `window.location.pathname` + dataset/globais |
| Header de escopo | **Obrigatório** `x-wdg-portal: 1` | Normalmente ausente | Evita mistura de identidade entre módulos |
| Identidade caixa pessoal | Precisa ser **e-mail** estável | Normalmente e-mail já disponível | Há rotinas para “garantir e-mail” no Portal |
| Restrição destinatários | Restrito à unidade/subunidades quando `x-wdg-portal: 1` | Sem restrição extra | Defesa contra sessão do Gestor no mesmo browser |
| Envio de anexos | Vercel Blob | Vercel Blob | Cloud-only; sem filesystem |
| Exclusão definitiva | Remove state e pode desativar mensagem | Idem | Com `ENABLE_DELETE_OLD_BLOB=1`, tenta apagar blobs |
| Caixa pública (grupo) | Leitura/envio pode ser permitido; ações bloqueadas | N/A | Backend bloqueia actions (marcador/excluir) para não-membro no Portal |

---

## Referências rápidas (código)

- Backend:
  - `POST /api/msg/messages`
  - `POST /api/msg/messages/actions`
  - `DELETE /api/msg/mailboxes/:id`
- Frontend:
  - Compose (FormData + `payload` + `anexos`)
  - Header `x-wdg-portal` no Portal

---

## 5) Auditoria — Configuração > Geral (Admin)

Esta seção cobre a tela **Caixa de Mensagem > Configuração > Geral** (módulo Condomínios), com foco em:

- Rastreio de **endpoints** consumidos no painel.
- Verificação de **simulações/fallbacks locais**.
- Validação da **lógica de contagens/métricas** (o que exatamente está sendo contado).

### Onde o painel é inicializado

- A view `cfg_geral` é renderizada no frontend e chama o initializer exposto pelo script do painel:
  - `window.__wdgMsgCfgGeralInit({ mode: 'embedded' })` em `public/js/condominios/caixa_de_mensagem.js`.
- O script do painel é carregado no template `views/condominios/caixa_de_mensagem.ejs`:
  - `public/js/condominios/configuracoes_geral.js`.

### Endpoints envolvidos (UI → API)

**Configurações (persistidas no banco via settings)**

- `GET /api/msg/admin/settings?unidade_id=...`
- `PUT /api/msg/admin/settings`

**Usuários (lista para suspensão e permissões por usuário Portal)**

- `GET /api/msg/admin/users?unidade_id=...`

**Caixas (listar, suspender/reativar, excluir definitivamente)**

- `GET /api/msg/admin/mailboxes?unidade_id=...`
- `PATCH /api/msg/admin/mailboxes/:id/status`
- `DELETE /api/msg/admin/mailboxes/:id`

**Métricas**

- `GET /api/msg/admin/metrics/users?unidade_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/msg/admin/metrics/mailboxes?unidade_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/msg/admin/metrics/timeseries/users?unidade_id=...&from=...&to=...`
- `GET /api/msg/admin/metrics/timeseries/mailboxes?unidade_id=...&from=...&to=...`

### Persistência: o que grava no banco e o que é imediato

- **Permissões (checkboxes por usuário do Portal) e Suspensão de usuários**:
  - No frontend, ao marcar/desmarcar, a mudança fica em memória (`dirtyPortalPerms`, `dirtySuspPortalList`, `dirtySuspColabList`).
  - A gravação no banco ocorre somente ao clicar em **Salvar** (via `PUT /api/msg/admin/settings`).

- **Suspender/Reativar caixas**:
  - É **imediato**: o botão chama `PATCH /api/msg/admin/mailboxes/:id/status` e recarrega a lista.

### Simulações e fallbacks locais (o que encontrei)

**Frontend (configuracoes_geral.js)**

- Não há geração de dados “fake/mock”.
- Existem estados visuais (ex.: `—`, “Carregando…”, “Sem dados no período”) que são apenas UI.
- Existe persistência local apenas para UX:
  - `localStorage` guarda a última `unidade_id` escolhida por Master/Admin (não armazena números/métricas).
- Existem comportamentos **best-effort** que podem mascarar falhas parciais:
  - `refreshAll()` chama `loadUsers/loadMailboxes/loadMetrics...` com `.catch(() => { /* noop */ })`.
    - Resultado: parte do painel pode ficar sem dados, mas a tela continua “Atualizado” sem detalhar qual bloco falhou.
  - Gráficos (timeseries) são carregados em background e falhas são ignoradas; pode ficar “Carregando gráficos…” indefinidamente.

**Backend (condominios-app.js)**

- Não encontrei rotas de admin retornando dados “hardcoded/mock”.
- O endpoint `GET /api/msg/admin/settings` tem um comportamento de “bootstrap”: se não existir settings para a unidade, ele cria o documento no Mongo com defaults.
  - Isso não é simulação: é insert real.
- O endpoint `GET /api/msg/admin/users` usa múltiplas coleções e várias leituras são encapsuladas em `try/catch { /* noop */ }`.
  - Resultado: se uma dessas fontes falhar (ex.: model ausente, schema mudou, query quebrou), o endpoint ainda pode responder `ok: true` com uma lista parcial, sem alertar.

### Métricas: definição do que está sendo contado

#### Fonte dos números

- As métricas são calculadas por agregações em `CondMsgMessage` (Mongo), filtrando por:
  - `unidade_id`
  - `ativo != false`
  - `createdAt` no range `[from, to]` (default: últimos 30 dias; máximo: 365 dias)

#### “Sent” (enviadas)

- **Por usuário**: agrupa por `from_owner`.
- **Por caixa**: agrupa por `from_mailbox_id`.
- **Série temporal**: conta mensagens no dia por `createdAt`.

#### “Received” (recebidas)

- O cálculo de “recebidas” usa `unwind` em `states`.
- **Por usuário**: filtra `states.mailbox_id = 'pessoal'` e agrupa por `states.owner`.
  - Implicação: “recebidas por usuário” reflete recebimentos na **caixa pessoal** (não inclui recebimentos em caixas de grupo).
- **Por caixa**: agrupa por `states.mailbox_id` (todas as caixas, incluindo `pessoal`).
  - Implicação: uma mensagem com múltiplos destinatários/caixas pode gerar **múltiplos states** e, portanto, “recebidas” pode ser maior que “enviadas”.
  - Isso pode ser correto (contagem por entrega), mas precisa estar documentado para evitar “aparente inconsistência”.

#### Bytes

- Bytes são estimados como:
  - `strLenBytes(body_text) + strLenBytes(body_html) + sum(anexos[].tamanho)`.
  - Isso é “tamanho armazenado”, não tráfego de rede.

#### Bucket diário e timezone

- Séries usam `America/Sao_Paulo` para agrupar por dia (reduz bugs ao redor de meia-noite).

### Recomendações

1. **Tornar falhas visíveis por bloco (frontend)**
   - Em vez de `catch(noop)` em `refreshAll()`, capturar e exibir um toast por seção (Usuários/Caixas/Métricas) ou um banner “Alguns dados não puderam ser carregados”.
   - Para timeseries, ao falhar, substituir “Carregando gráficos…” por “Falha ao carregar gráficos (tente atualizar)”.

2. **Evitar resposta parcial silenciosa em `GET /api/msg/admin/users` (backend)**
   - Registrar warning quando qualquer sub-query falhar (incluindo qual fonte falhou).
   - Opcional: incluir no payload algo como `warnings: ['CondMorador query failed']` para auditoria/diagnóstico.

3. **Documentar a semântica de “recebidas”**
   - Explicitar na UI/tooltip se “recebidas” é:
     - por entrega (state) vs por mensagem única
     - por caixa pessoal apenas (no painel por usuário)
   - Se o objetivo for “mensagens únicas recebidas”, ajustar as agregações para deduplicar por `_id` (ou outro identificador) após o unwind.

4. **Performance (se crescer muito)**
   - Considerar índices em `CondMsgMessage` para `{ unidade_id, createdAt, ativo }` e, se necessário, índices auxiliares para campos usados nas agregações.
   - Se o volume for alto, avaliar pré-agregação diária (materialized view) para timeseries.

