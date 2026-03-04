# Gestor — Migration Plan (etapa de mapeamento)

## Montagem atual (createServer/app)

- Registro modular: `src/server/createServer.js` importa `#modules/gestor/index.js` e monta via `app.use(meta.basePath, built)`.
- `basePath` efetivo do módulo: `/gestor` (definido em `src/modules/gestor/index.js`).
- Alias de montagem do módulo Gestor: **não há alias dedicado** (diferente de `/condominio` e `/portal_morador`).
- Compatibilidades no app raiz que impactam o Gestor:
  - `app.use('/api', ...)` com redirecionamento para `/gestor/api/*` (exceto rotas públicas específicas).
  - Guards públicos para login/primeiro acesso (`/gestor/login`, `/gestor/primeiroacesso` e variações sem prefixo em fluxos centrais).

## Entry points do Gestor

- Legado histórico (não montado em produção):
  - `src/legacy/gestor-app.legacy.js`.
- Entry modular ativo:
  - `src/modules/gestor/index.js` (contrato de módulo + meta/basePath + init opcional).
  - `src/modules/gestor/app/gestor-app.js` (sub-app Express com rotas e middlewares do Gestor).
- Superfície do módulo:
  - `src/modules/gestor/app/routes/**`
  - `src/modules/gestor/app/controllers/**`
  - `src/modules/gestor/app/middlewares/**`
  - `src/modules/gestor/app/services/**`

## Acoplamentos principais

- **Condomínios**
  - Compatibilidade de resolução de módulo no auth (inclui singular/plural `condominio(s)`).
  - Widget settings centralizados no Gestor incluem módulo `condominios`.
- **Portal Morador**
  - Compatibilidade `portal_morador` vs `portal-morador` no auth e widget settings.
  - App raiz reaproveita handlers de auth do Gestor para rotas genéricas por segmento.
- **Escalas**
  - `requireLogin` do Gestor contém bypass explícito para caminhos `/escalas` e sessão `escalasUser`.
  - Fluxos de compatibilidade no app raiz evitam acoplamento incorreto de sessão entre módulos.
- **Shared/Core**
  - Dependência extensa de `#core/models/*`, `#core/utils/*`, `#core/mail/*`, middlewares compartilhados e sessão global.

## Risco estimado

- **Médio-alto** para extração completa, por causa de:
  - auth/sessão centralizados e reaproveitados por outros módulos;
  - compatibilidades históricas no app raiz (`/api` -> `/gestor/api`);
  - mistura de páginas, APIs e assets no mesmo sub-app.
- **Baixo** para migração incremental por micro-patches com contrato congelado e validação de paridade.

## Plano em micro-patches (4–6 passos)

1. Congelar contrato HTTP do Gestor (feito nesta etapa) e manter snapshot versionado.
2. Mapear e congelar pontos de compatibilidade no app raiz (`/api`, login/primeiro acesso, assets) em documento dedicado.
3. Isolar bootstrap do Gestor (middlewares globais do sub-app) em função `buildGestorModule()` sem alterar rotas.
4. Introduzir wrapper explícito do Gestor no registry (similar ao padrão adotado em condomínios), atrás de flag de rollout.
5. Rodar suíte de contrato/paridade OFF/ON da flag e comparar snapshot de rotas + smoke de login/dashboard/API.
6. Só após paridade completa, planejar remoção gradual de compat legada no app raiz em patches pequenos.
