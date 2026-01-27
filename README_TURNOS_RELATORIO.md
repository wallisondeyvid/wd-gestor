# Relatório de Revisão da Aba Turnos

Data: 2025-10-14
Escopo: Análise de inconsistências, legacies, performance, acessibilidade e propostas de melhorias na aba Turnos da tela `escala_nova`.

## 1. Resumo Executivo
A aba Turnos apresentava alta redundância de chamadas de render, múltiplos listeners de clique, uso heterogêneo de identificadores e camadas de fallback/legacy que aumentavam complexidade. Foram aplicados microfixes iniciais para estabilizar exclusão de grupos de turnos e reduzir re-renders.

Principais ganhos imediatos:
- Exclusão confiável via DELETE direto (`excluirGrupoTurnoPorId`).
- Debounce de render (`scheduleRenderGruposTurnos`).
- Padronização parcial de IDs (uso de `originalId || id`).
- Acessibilidade básica adicionada (aria-label em botões de ação).

## 2. Inconsistências Identificadas
| Categoria | Descrição | Impacto | Evidência/Local | Recomendação | Prioridade |
|-----------|-----------|---------|----------------|--------------|------------|
| IDs | Mistura de `id`, `_id`, `originalId`, `grupoId` em estado e payloads | Bugs silenciosos em exclusão/atualização | `escala_nova.js` funções de map | Definir contrato único `id`; remover `originalId` após migração | Alta |
| Eventos | Listener delegado + forced capture + timeouts tardios | Duplicidade e risco de execuções repetidas | Seções exclusão em `escala_nova.js` | Centralizar bind único; remover forced quando core estável | Alta |
| Render | Chamadas múltiplas e timeouts (120,300,500,900,800ms etc) | Custo e race conditions visuais | Linhas grep `renderGruposTurnos(` | Debounce (já feito) + diff incremental | Alta |
| Fallback/Legacy | Várias heurísticas de parsing, funções “extreme” | Código difícil de manter | Blocos `__extractGruposFromPayload` | Isolar módulo dedicado + testes | Média |
| Concurrency Estado | Atualizações de estado em paralelo com timeouts | Estado inconsistente após operações rápidas | Exclusão e refresh | Scheduler único p/ render + fila de operações | Média |
| Acessibilidade | Ausência de aria-label antes do fix | Uso dificultado por leitores de tela | Botões ação | Adicionar mais atributos (role, focus management) | Média |
| Observabilidade | Log excessivo/traces em produção | Poluição console e impacto leve performance | console.debug/trace | Flag de nível de log (`__ESCALA_DEBUG__`) | Média |
| Manutenibilidade | Monólito misto de concerns | Entrave para evolução modular | Tamanho ~6900 linhas | Extrair módulos: store, render, api | Alta |
| UX Feedback | Ação excluir sem feedback visual (spinner apenas no botão) | Incerto para usuário lento | Função exclusão | Toast rápido “Grupo removido” | Baixa |

## 3. Melhorias Aplicadas
- Helper `getEscalaApiBase()` (padronização futura).
- Debounce com `scheduleRenderGruposTurnos` (reduz tempestade de renders).
- Aria-label nos botões Editar/Excluir.
- Guardas para não invocar listener delegado quando core não pronto.
- Contador `__turnosRenderCount` para futura análise.

## 4. Plano de Refatoração por Fases
### Fase 0 (Concluída Parcialmente)
Debounce, acessibilidade básica, estabilização de exclusão.

### Fase 1 (Isolação)
- Extrair `turnosStore.js` (operações CRUD locais + sincronização).
- Extrair `turnosRender.js` (funções puras: construir linha HTML, diff incremental).
- Criar teste automatizado (Jest) para fluxo adicionar/excluir.

### Fase 2 (Eventos e Estado)
- Único dispatcher: `escala:gruposTurnos:changed`.
- Remover forced capture listener após 2 semanas sem incidentes (telemetria).
- Introduzir fila simples de operações (exclusões vs atualizações simultâneas).

### Fase 3 (Legacy Cleanup)
- Módulo de parsing de chaves (`turnosKeyParser.js`) com matriz de testes.
- Remover heurísticas não acionadas (telemetria de contador de chamados).

### Fase 4 (UX/A11y Avançada)
- Foco automático pós-exclusão no botão Inserir.
- Toast/alert não bloqueante confirmando ação.
- Atalhos de teclado (ex: Alt+N novo grupo, Del excluir selecionado).

## 5. Métricas Propostas
| Métrica | Como medir | Objetivo |
|---------|------------|----------|
| Renders por minuto | Incremento de `__turnosRenderCount` / tempo | < 10/min uso normal |
| Latência exclusão | Tempo entre clique e remoção DOM | < 300ms |
| Erros de DELETE | Contador falhas fetch | 0 em produção |
| Ativações fallback | Contador chamadas extreme/fallback | Reduzir a 0 |

## 6. Próximos Microfixes Recomendados
1. Substituir uso residual de `renderGruposTurnos()` fora da tabela por `scheduleRenderGruposTurnos()` (já majoritariamente feito; revisar diffs). 
2. Introduzir `mostrarToastTurnos(msg)` utilitário leve. 
3. Mapear se `rebuildTurnosTableFromState()` pode ser simplificada (talvez fundir com diff incremental). 
4. Criar script de coleta de telemetria simples (armazenar em `window.__ESCALA_METRICAS__`).

## 7. Riscos se Não Refatorar
- Crescimento de complexidade > bugs difíceis de reproduzir.
- Performance degradada em escalas com muitos grupos.
- Maior tempo de onboarding para novos desenvolvedores.

## 8. Checklist de Conclusão Desejada
- [ ] Módulos separados (store, render, api, parser). 
- [ ] Testes Jest para CRUD de grupos. 
- [ ] Telemetria ativa sem logs ruidosos. 
- [ ] Forced listener removido ou desativado por padrão. 
- [ ] Documentação de contrato (`CONTRATO_GRUPOS_TURNOS.md`).

## 9. Anexo: Contrato Proposto (Resumo)
Objeto Grupo: `{ id: string, turnos: Array<{ ini: string, fim: string }> }`
Operações:
- Criar: POST `/api/escalas/:id/grupos_turnos` body `{ turnos: [...] }`
- Excluir: DELETE `/api/escalas/:id/grupos_turnos/:grupoId`
- Atualizar Turnos: PUT/PATCH específicos (a definir simplificação)
Eventos front-end: `escala:gruposTurnos:changed { grupos }`

---
Gerado automaticamente. Atualize conforme novas decisões.
