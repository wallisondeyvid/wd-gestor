# FEATURE_FLAGS

Infra mínima de flags para migração segura, sem alterar regras de negócio.

## Fonte de verdade
- Prefixo principal: `WDG_FLAG_<NOME>`
- Compatibilidade legada mantida: `ENABLE_ESCALAS` (mapeia para `escalas`)

## Regras
- Valores verdadeiros: `1`, `true`, `yes`, `on`, `enabled`
- Valores falsos: `0`, `false`, `no`, `off`, `disabled`
- Nome da flag é normalizado para minúsculas.

## Exemplo
- `WDG_FLAG_PORTAL_MORADOR=1`
- `WDG_FLAG_ESCALAS=0`

## Inspeção local
- `npm run flags:print`
