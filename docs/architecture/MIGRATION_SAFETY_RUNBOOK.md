# MIGRATION_SAFETY_RUNBOOK

Runbook mínimo para validar a segurança da migração sem refactor funcional.

## Pré-check local
1. `npm run guard:migration`
2. `npm run arch:map`
3. `npm run test:smoke`

Atalho:
- `npm run migration:check`

## CI
- Workflow: `.github/workflows/migration-safety.yml`
- Executa guardrails + suíte de testes.

## Rollback rápido
- Reverter último commit:
  - `git revert <sha>`
- Reverter toda sequência de hardening (ordem inversa):
  - `git revert <sha_commit7> <sha_commit6> <sha_commit5> <sha_commit4> <sha_commit3> <sha_commit2> <sha_commit1>`

## Variáveis de ambiente introduzidas
- `WDG_FLAG_*` (feature flags por env)
- `WD_TRACE_REQUESTS=1` (habilita log de rastreio por request)
- `WD_LEGACY_IMPORT_WHITELIST` (whitelist temporária para imports legacy no guard)

## Artefatos gerados
- `docs/architecture/MAP.md`
- `docs/architecture/DUPLICATIONS.md`
- `docs/architecture/IMPORT_GRAPH.md`
- `docs/architecture/FEATURE_FLAGS.md`
- `docs/architecture/TRACE_REQUESTS.md`
