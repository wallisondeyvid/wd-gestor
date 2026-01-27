# Refactor Turnos - Escala

## Visão Geral
A aba de Turnos foi simplificada para reduzir duplicações e efeitos colaterais. Funções legacy que causavam múltiplos caminhos de renderização foram substituídas por uma via única debounced.

## Funções Atuais
- `renderGruposTurnos(reason?)`: Renderiza a tabela de grupos de turnos a partir de `state.gruposTurnos` (ou `window.__ESCALA_STATE__.gruposTurnos`). Aceita um motivo opcional para logs.
- `refreshTurnosDebounced(reason?)`: Debounce de ~120ms que dispara `renderGruposTurnos`, `renderMatrizesPorGrupo` e `avaliarProgressaoAbas` evitando tempestade de renders.

## Funções Legacy (Stubs)
As funções abaixo permanecem como stubs para compatibilidade com código existente ou eventos ainda não limpos:
- `rebuildTurnosTableFromState()`
- `forceRepaintTurnosList(gid)`
- `updateTurnosRowDOM(grupoId, turnos)`

Todas delegam (diretamente ou indiretamente) para `renderGruposTurnos` ou não fazem nada significativo.

## Fluxo Após Operações de Turnos
1. Ações de criação/edição/exclusão disparam requisições (POST/PUT/DELETE).
2. Patch de `fetch` intercepta respostas bem-sucedidas e aciona:
   - `window.document.dispatchEvent('turnoAtualizado')`.
   - `refreshTurnosFromServer` (se disponível) OU fallback inline que reconstrói `gruposTurnos`.
   - `refreshTurnosDebounced()` para consolidar render.

## Eventos
- `turnoAtualizado`: Continua existindo para compat com listeners externos, mas a recomendação é usar diretamente `refreshTurnosDebounced` onde possível.
- `escala:turnos:atualizados`: Emissão pós atualizações; pode ser reduzida se redundante.

## Teste Adicionado
Arquivo `tests/turnos_debounce.test.js` valida que múltiplas chamadas seguidas de `refreshTurnosDebounced` dentro da janela resultam em apenas um render.

## Próximos Passos Sugeridos
- Remover watchers de boot excessivos (retryBootQuick / retryBootWindowLate) após validar que init único cobre casos.
- Padronizar nomenclatura de eventos e eliminar `forceRepaintTurnosList` dos pontos restantes.
- Extrair lógica de normalização de payload de grupos para módulo separado (`turnosData.js`).
- Adicionar testes para mapeamento profundo de payload (função `__extractGruposFromPayload`).

## Boas Práticas
- Evitar `setTimeout` em cascata para renders; preferir o debounce central.
- Registrar motivos em `renderGruposTurnos` para facilitar auditoria durante limpeza final.
- Remover gradualmente stubs após confirmar nenhum consumidor externo depende deles.

