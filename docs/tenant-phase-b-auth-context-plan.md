# Fase B — Consolidação Semântica do Auth-context e Domínios Híbridos do Gestor

## Contexto

- WD Gestor, neste plano, significa a aplicação inteira.
- A Fase A consolidou a auditoria inicial de dados e domínios em `docs/multi-tenant-domain-matrix.md`.
- O estado atual do produto continua sendo de adoção parcial da infraestrutura tenant-aware: a base técnica já existe, mas a semântica operacional ainda é híbrida em partes importantes do módulo Gestor.
- O checkpoint global atual mantém a trilha de microcortes pausada, com baseline verde e sem recomendação de novo microcorte seguro dentro da régua anterior.
- Por isso, a Fase B não é uma fase de patch imediato. Ela é uma fase semântica e operacional destinada a fechar o significado de identidade global, vínculo por unidade, operação contextual e globais legítimos antes de qualquer ativação ampla de runtime, multi-db ou PostgreSQL.

## Objetivo exato

Consolidar o modelo semântico do Gestor para que o runtime futuro possa operar com fronteiras claras entre:

- identidade global;
- vínculo contextual por unidade;
- operação contextual;
- catálogos globais legítimos;
- compat legado temporário.

Em termos práticos, a Fase B deve reduzir ambiguidade arquitetural, não apenas ambiguidade de implementação.

## Escopo

- `auth-context` como fonte canônica de autenticação e contexto ativo;
- `user_memberships` como fonte de verdade do vínculo por unidade;
- `global_role` como privilégio global legítimo;
- `req.unitScope` como escopo operacional efetivo das rotas tenant-sensitive;
- `active_unidade_id` como representação do contexto ativo contextual;
- `req.session.user` como projeção de compatibilidade enquanto o legado ainda existir;
- `GLOBAL_SCOPE` como mecanismo restrito a ramos globais legítimos explícitos;
- domínios híbridos do módulo Gestor, especialmente usuários, unidades, funcionários, módulos, funções, setores, recursos, feedback e superfícies auxiliares de autenticação e autorização.

## Fora de escopo

- PostgreSQL;
- Portal do Morador como frente de migração nesta fase;
- Escalas como frente de consolidação semântica nesta fase;
- Condomínios como frente de consolidação semântica nesta fase;
- Assembleia e outras famílias que ainda dependem de decisão funcional própria;
- microcorte local;
- cleanup cosmético;
- ativação de flags;
- reescrita ampla de `api.db.js` ou `auth.db.js` em uma única entrega;
- alteração funcional imediata.

## Modelo semântico

### 1. Identidade global

| Elemento | Papel esperado |
| --- | --- |
| `User` | identidade global autenticável por e-mail e senha |
| `global_role` | privilégio global legítimo, independente de unidade ativa |
| credenciais, lockout, reset, remember token | responsabilidade global do usuário |

Regras esperadas:

- identidade global não equivale a contexto operacional por unidade;
- `master` e `admin` permanecem globais legítimos;
- identidade global não deve inventar contexto ativo para manter compatibilidade legado.

### 2. Vínculo por unidade

| Elemento | Papel esperado |
| --- | --- |
| `user_memberships` | fonte de verdade do vínculo contextual por unidade |
| `papel_contextual` | papel operacional por unidade |
| `funcionario_id` | vínculo opcional com funcionário operacional |
| `unidade_id` | referência contextual da associação |

Regras esperadas:

- um usuário pode ter zero, um ou vários vínculos ativos;
- vínculo contextual é distinto de identidade global;
- vínculo por unidade não deve depender de projeção acidental em sessão legado.

### 3. Operação contextual

| Elemento | Papel esperado |
| --- | --- |
| `req.unitScope` | escopo operacional efetivo da requisição |
| `active_unidade_id` | unidade ativa do contexto autenticado |
| domínios operacionais | funcionários, funções, setores, recursos, páginas e APIs contextuais |

Regras esperadas:

- operações tenant-sensitive dependem de contexto canônico ou de exceção global legítima explícita;
- o contexto operacional não pode nascer de fallback legado concorrente;
- ausência de contexto ativo não pode ser convertida automaticamente em autorização contextual.

### 4. Catálogos globais legítimos

| Elemento | Papel esperado |
| --- | --- |
| módulos | catálogo global do produto |
| parte administrativa de unidades | catálogo administrativo global legítimo |
| snapshots e trilhas globais de provisioning | estado global do tenant base |
| configurações globais | settings de aplicação não contextuais |

Regras esperadas:

- catálogo global legítimo não deve ser confundido com dado operacional por unidade;
- uso de `GLOBAL_SCOPE` só é aceitável quando o ramo global já estiver explicitamente reconhecido como legítimo.

### 5. Compat legado temporário

| Elemento | Papel esperado |
| --- | --- |
| `req.session.user` | projeção de compatibilidade |
| `req.user` | reidratação transitória para guards legados |
| usos residuais de `GLOBAL_SCOPE` | compatibilidade controlada em superfícies ainda não segmentadas |
| trechos residuais em `auth.db.js` e `api.db.js` | fronteiras técnicas temporárias |

Regras esperadas:

- compat legado temporário não pode virar regra de autorização material;
- o legado pode sobreviver como projeção ou ponte, não como fonte canônica concorrente.

## Papel esperado dos elementos centrais

### `auth-context`

- Deve ser a fonte canônica de autenticação, seleção pendente e contexto ativo do Gestor.
- Deve separar explicitamente usuário global de usuário contextual com unidade ativa.

### `user_memberships`

- Deve ser a fonte de verdade do vínculo por unidade.
- Não substitui a identidade global; complementa a identidade global com contexto operacional.

### `req.unitScope`

- Deve representar o escopo efetivo da requisição quando a operação for tenant-sensitive.
- Não deve ser inferido por fallback legado concorrente sem critério explícito.

### `req.session.user`

- Deve sobreviver apenas como projeção de compatibilidade para código legado ainda não migrado.
- Não deve ser tratado como fonte primária de autorização.

### `global_role`

- Deve representar apenas privilégio global legítimo.
- Não deve ser usado para simular contexto ativo quando este não existir.

### `active_unidade_id`

- Deve representar o contexto ativo já selecionado e resolvido.
- Não deve ser preenchido artificialmente para manter o legado operando em silêncio.

### `GLOBAL_SCOPE`

- Deve ser restrito a ramos globais legítimos já reconhecidos documentalmente.
- Não pode continuar como mecanismo difuso para “fazer funcionar” superfícies híbridas sem classificação semântica.

## Subfases da Fase B

### B1 — Modelo semântico canônico de auth e contexto

**Objetivo**

- Fechar semanticamente a relação entre identidade global, vínculo contextual, seleção pendente e contexto ativo.

**Arquivos e documentos prováveis**

- `docs/gestor-auth-context-phase3-spec.md`
- `docs/multi-tenant-domain-matrix.md`
- `docs/migration-status.md`

**Riscos**

- misturar identidade global com autorização contextual;
- manter ambiguidade entre sessão legado e contexto canônico.

**Testes e checkpoints necessários**

- checkpoints de auth-context, login, seleção de unidade, `/gestor/api/usuario`, `/gestor/api/modulos`, cluster e funcionários;
- baseline de runtime-contract já observada no Gestor.

**Critério de pronto**

- ficar inequívoco, em documento, o que nasce de `global_role`, o que nasce de `user_memberships` e o que nasce do contexto ativo.

### B2 — Inventário de globais legítimos e `GLOBAL_SCOPE`

**Objetivo**

- Separar globais legítimos de globais de conveniência técnica.

**Arquivos e documentos prováveis**

- `docs/multi-tenant-domain-matrix.md`
- `docs/gestor-provisioning-contract.md`
- checkpoints de módulos, unidades, usuários e funcionários

**Riscos**

- continuar tratando ausência de escopo como global aceitável por default;
- preservar `GLOBAL_SCOPE` difuso em superfícies híbridas.

**Testes e checkpoints necessários**

- suites de runtime-contract de usuários, unidades, módulos e funcionários;
- baseline descrita em `docs/migration-status.md`.

**Critério de pronto**

- lista fechada dos ramos que podem usar `GLOBAL_SCOPE` sem ambiguidade arquitetural.

### B3 — Posicionamento operacional de `user_memberships`

**Objetivo**

- Definir quando e como `user_memberships` deixa de ser apenas estrutura provisionada e passa a sustentar o runtime.

**Arquivos e documentos prováveis**

- `docs/runbooks/user-memberships-phase2-backfill.md`
- `docs/gestor-auth-context-phase3-spec.md`
- checkpoints de usuários, auth-context e seleção de unidade

**Riscos**

- usar `user_memberships` cedo demais;
- ou mantê-lo indefinidamente como estrutura passiva sem valor operacional.

**Testes e checkpoints necessários**

- contratos de login, seleção pendente, usuários administrativos e cluster.

**Critério de pronto**

- documento fechando pré-condições, rollout esperado, compatibilidades mantidas e rollback documental.

### B4 — Inventário de fallbacks e dívidas controladas

**Objetivo**

- Separar o que precisa ser removido, o que deve ser só documentado e o que pode permanecer temporariamente.

**Arquivos e documentos prováveis**

- `docs/multi-tenant-domain-matrix.md`
- `docs/migration-status.md`
- checkpoints de tenant enforcement do Gestor

**Riscos**

- deixar fallback perigoso sem nome, sem dono e sem horizonte de remoção.

**Testes e checkpoints necessários**

- famílias de funcionários, unidades, funções, setores, recursos, usuários e feedback.

**Critério de pronto**

- inventário fechado nas categorias: remover, documentar, manter temporariamente.

### B5 — Gate de entrada para Fase C

**Objetivo**

- Definir as condições mínimas para uma futura ativação controlada por feature flag.

**Arquivos e documentos prováveis**

- `docs/gestor-auth-context-phase3-spec.md`
- `docs/multi-tenant-domain-matrix.md`
- `docs/migration-status.md`

**Riscos**

- ativar flag sem semântica estabilizada;
- entrar em rollout sem rollback claro.

**Testes e checkpoints necessários**

- baseline verde, runtime-contracts críticos, parity onde existir e watchdogs do Gestor.

**Critério de pronto**

- gates mínimos documentados para entrar em Fase C sem improviso operacional.

## Fallbacks

### Remover

- `req.user.unidade_id` como fonte material concorrente ao contexto canônico;
- `req.session.user.unidade_id` funcionando como autorização real;
- `GLOBAL_SCOPE` difuso em superfícies tenant-sensitive;
- writes dependentes de contexto sem unidade canônica resolvida.

### Documentar

- visão global explícita de `master` e `admin`;
- seleção pendente sem contexto ativo;
- catálogos administrativos globais legítimos;
- compatibilidades transitórias ainda aceitas em auth, usuários e feedback.

### Manter temporariamente

- `req.session.user` como projeção de compatibilidade;
- ramos globais privilegiados já consolidados documentalmente;
- compatibilidade com flag desligada nas superfícies ainda não migradas por completo.

## Critérios para avançar para Fase C

- semântica de `auth-context` fechada;
- `user_memberships` posicionado como fonte de vínculo contextual com ordem clara de adoção;
- globais legítimos listados por domínio;
- fallbacks perigosos inventariados;
- flags catalogadas com rollback;
- contratos runtime críticos do Gestor permanecendo verdes;
- dependência residual de `api.db.js` e `auth.db.js` semanticamente segmentada, ainda que não removida.

## Riscos principais

- tentar resolver implementação antes de fechar a semântica;
- usar `user_memberships` cedo demais, antes de fechar a convivência com `global_role` e sessão legado;
- ampliar escopo e reabrir Portal, Escalas ou Condomínios dentro de uma fase que é do Gestor;
- transformar a fase em refactor técnico difuso em vez de consolidação operacional;
- ativar flags sem critérios de entrada e rollback suficientemente fechados.

## Primeiro artefato operacional da Fase B

O primeiro artefato operacional recomendado para a Fase B é um documento de modelo operacional do Gestor contendo quatro tabelas canônicas:

1. identidade global;
2. vínculo por unidade;
3. operação contextual;
4. globais legítimos versus compat legado.

Esse artefato deve nascer como derivação direta deste plano e de `docs/gestor-auth-context-phase3-spec.md`, funcionando como ponte entre matriz semântica e futura preparação de rollout controlado.

## Escopo desta fase documental

- documento estritamente documental e operacional;
- sem alteração de código;
- sem alteração de testes;
- sem proposta de patch imediato;
- sem início de PostgreSQL.