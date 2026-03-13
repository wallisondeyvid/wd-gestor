# Pages/Auth-Context Subfase 1

## Objetivo encerrado

- Alinhar `requireLogin`, `requireRole` e os principais fluxos de `pagesController` ao `auth-context` e ao `unitScope` canônicos, reduzindo fallbacks legados locais sem reabrir bridge nem iniciar refactor amplo.

## Estado atual

- `requireLogin`, `requireRole` e `requireUnitScope` já priorizam `auth-context` e `unitScope` nos caminhos críticos.
- Os principais fluxos de `pagesController` já operam em modo context-first, com cobertura focal sustentando o estado atual em Funções, Funcionários, Recursos, Setores e Unidades.
- As superfícies relevantes de leitura e escrita do Gestor já seguem protegidas pelo contexto ativo.

## Resíduos restantes

- `paginaUnidades` e `paginaEditarUnidade` ainda preservam fallback legado isolado para cenários sem `unitScope` contextual ativo.
- Esses resíduos permanecem como compatibilidade residual e não configuram hotspot real no estado atual.

## Conclusão

- Não há novo hotspot real nesta frente.
- A subfase entrou em retorno decrescente.
- Novos patches nessa área só se justificam com repro concreta de isolamento ou contexto.