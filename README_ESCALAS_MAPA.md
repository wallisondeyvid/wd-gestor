# Escalas – Mapa de Arquivos e Inclusões

Este documento consolida os caminhos e responsabilidades do módulo de Escalas após a migração para arquivos modulares. Use como referência rápida para evitar confusões de nomes e caminhos.

## visão geral

- Página principal (EJS): `views/escalas/escala_nova_index.ejs`
- Scripts públicos do módulo: `public/escalas/js/escalas/`
- Orquestrador oficial: `public/escalas/js/escalas/escala_nova_index.js`
- Compatibilidade leve: globais mínimos agora são expostos por `public/escalas/js/escalas/aba1_dados_gerais.js` (sem necessidade de shim)
- Abas modulares:
  - Dados Gerais: `public/escalas/js/escalas/aba1_dados_gerais.js`
  - Turnos: `public/escalas/js/escalas/aba2_turnos.js`
  - Equipes: `public/escalas/js/escalas/aba3_equipes.js`
  - Alocação: `public/escalas/js/escalas/aba4_alocacao.js`
  - Recursos: `public/escalas/js/escalas/aba5_recursos.js` (alias: `aba5_recusos.js`)
  - Validação: `public/escalas/js/escalas/aba6_validacao.js`
- Modais e integrações:
  - Implementações de modais: `public/escalas/js/escalas/modais.js`
  - Popups auxiliares: `public/escalas/js/escalas/modais_popups/` e `public/escalas/js/modais_popups/`

## ordem de includes na view principal

Dentro de `views/escalas/escala_nova_index.ejs`:

1) Vendors e iniciais (Bootstrap, Flatpickr, etc.)
2) Compatibilidade leve:
  - `/escalas/js/escalas/aba1_dados_gerais.js`
3) Módulos por aba (antes do orquestrador):
   - `/escalas/js/escalas/aba1_dados_gerais.js`
   - `/escalas/js/escalas/aba2_turnos.js`
   - `/escalas/js/escalas/aba3_equipes.js`
   - `/escalas/js/escalas/aba4_alocacao.js`
   - `/escalas/js/escalas/aba5_recursos.js` (e o alias `/escalas/js/escalas/aba5_recusos.js`)
   - `/escalas/js/escalas/aba6_validacao.js`
   - `/escalas/js/escalas/modais.js`
   - Outras integrações: p.ex. `/escalas/js/modais_popups/modal_pesquisar_efetivo.js`, `/escalas/js/escalas/efetivo.js`
4) Orquestrador (sempre por último para acionar init() das abas):
   - `/escalas/js/escalas/escala_nova_index.js`

Observação: Os arquivos legados `escala_nova.js` foram REMOVIDOS do repositório. A view não inclui nenhum shim, e todo o fluxo usa apenas os módulos por aba e o orquestrador `escala_nova_index.js`.

## mapeamento legado → modular

| Origem (legado) | Novo destino | Notas |
| --- | --- | --- |
| Orquestração da página | `public/escalas/js/escalas/escala_nova_index.js` | Persiste aba ativa, fallback de carga por id, auto-switch para Recursos |
| Dados Gerais | `public/escalas/js/escalas/aba1_dados_gerais.js` | Popula unidades, responsável, regras de período, salva mínimo (fallback) |
| Turnos (grupos, render, exclusão, popup) | `public/escalas/js/escalas/aba2_turnos.js` | Expõe `renderGruposTurnos` e `excluirGrupoTurnoPorId` |
| Equipes | `public/escalas/js/escalas/aba3_equipes.js` | CRUD/render de equipes |
| Alocação (matriz) | `public/escalas/js/escalas/aba4_alocacao.js` | Integra com auto-switch de Recursos |
| Recursos | `public/escalas/js/escalas/aba5_recursos.js` | Alias `aba5_recusos.js` mantido por compat |
| Validação (gatilho) | `public/escalas/js/escalas/aba6_validacao.js` | `executarValidacaoConflitos` exposto em aba6 como stub |
| Modais (detalhamento equipe/dia) | `public/escalas/js/escalas/modais.js` | Implementa `abrirModalDetalhamentoEquipeDiaImpl` |
| Globais esperados (abas, utils) | `public/escalas/js/escalas/aba1_dados_gerais.js` | `__ESCALA_STATE__`, `setAbasHabilitadas`, `avaliarProgressaoAbas`, `dateBrToISO` |

## itens legados e referências (removidos)

- Core legado e shim: REMOVIDOS do repositório
  - `public/escalas/js/escala_nova.js` (removido)
  - `public/escalas/js/escalas/escala_nova.js` (removido)
- Ferramentas de diagnóstico antigas que apontavam para os caminhos removidos permanecem apenas como histórico e podem ser apagadas futuramente:
  - `tmp/*.cjs|*.js` (vários arquivos apontando para `public/escalas/js/escala_nova.js`)
  - `scripts/bisect_check.cjs`, `scripts/check_balance.cjs`, `scripts/find_unmatched_try.cjs`, `scripts/find_unmatched_try.js`

Observação: se essas ferramentas forem reutilizadas, adapte-as para os módulos atuais (`aba*`, `modais.js`, `efetivo.js`, `escala_nova_index.js`) ou remova-as.

## testes relacionados

- Smoke test de turnos: `tests/turnos_smoke_test.cjs` (carrega `aba1_dados_gerais.js` + `aba2_turnos.js`)
- Boot (skipped): `tests/bootstrap_boot.test.js` (importa `aba1_dados_gerais.js`)

## convenções e pontos de atenção

- O orquestrador deve ser SEMPRE `escala_nova_index.js`.
- A inclusão do `aba1_dados_gerais.js` deve vir antes do orquestrador e demais abas (já está assim na view).
- As funções globais de abas vêm do shim: `setAbasHabilitadas`, `avaliarProgressaoAbas`.
- O estado global mínimo é `window.__ESCALA_STATE__`.
- A função global para detalhamento é delegada assim que possível para `abrirModalDetalhamentoEquipeDiaImpl` definida em `modais.js`.
- O alias `aba5_recusos.js` permanece por compat (não adicionar lógica nova nele).

## checklist de verificação rápida

- [x] A view `escala_nova_index.ejs` não inclui `escala_nova.js` (legado)
- [ ] `aba1_dados_gerais.js` está incluído antes do orquestrador e módulos dependentes
- [ ] Abas `aba1..aba6` e `modais.js` são carregados antes do `escala_nova_index.js`
- [ ] Teste `tests/turnos_smoke_test.cjs` passa
- [ ] Scripts de diagnóstico não são executados em produção

---

Dúvidas ou ajustes: procure por “escala_nova_index.js”, “aba1_dados_gerais.js” e “aba2_turnos.js” no workspace para localizar rapidamente os pontos de integração principais.
