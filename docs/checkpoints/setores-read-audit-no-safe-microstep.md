# Setores Read Audit - sem micro-passo seguro

## Objetivo da auditoria

- Registrar a auditoria read-only do slice de Setores no Gestor.
- Preservar a conclusao de que nao ha micro-passo seguro recomendado nesta rodada.
- Evitar reabertura dessa frente sem repro concreta ou cobertura focal melhor.

## Estado atual real do slice de Setores

- O slice de Setores permanece funcional e coerente com o contexto ativo nos fluxos auditados.
- A infraestrutura tenant-aware ja existente sustenta os repositories e wrappers usados pelo slice.
- O controller ainda depende da fachada ampla de compatibilidade, mas nem todos os call sites tem o mesmo perfil de risco.

## Compatibilidade residual estreita

- getSetoresPorUnidade permanece como compatibilidade residual estreita.
- getSetor permanece como compatibilidade residual estreita.
- Em ambos os casos, o controller termina rapidamente em helper do wrapper que ja delega para repository tenant-aware existente.
- O ganho arquitetural de um corte adicional nesses pontos seria pequeno e hoje nao compensa o custo operacional diante dos guardrails ativos.

## Hotspot real, mas grande demais para micro-passo seguro

- listarSetores continua sendo o hotspot real do slice.
- Esse fluxo ainda concentra contexto canonico, fallback legado de cluster, lookup de unidades acessiveis, leitura principal dos setores e fallback de populate/label de unidade.
- Embora seja o ponto com maior concentracao de bridge residual, ele nao cabe em micro-passo seguro comparavel ao que foi feito em Funcoes.
- Qualquer tentativa de reducao local aqui tende a aumentar blast radius ou reabrir compatibilidades que hoje estao apenas controladas.

## Guardrails que limitam cortes mais agressivos

- Controllers do Gestor nao podem importar db diretamente.
- Controllers do Gestor nao podem importar repositories diretamente.
- Services do Gestor nao podem importar db diretamente, exceto em services/legacy.
- As fachadas permitidas no Gestor permanecem em modo reexport-only.
- Reexport de db fora de services/legacy viola guardrail estrutural.

## Motivo para nao recomendar alteracao agora

- Os pontos pequenos restantes em Setores sao estreitos demais para gerar ganho arquitetural relevante.
- O ponto arquiteturalmente mais relevante do slice e justamente o que excede o limite de um micro-passo seguro.
- A cobertura focal atual sustenta o estado observado do slice, mas nao abre um corte menor com relacao risco/ganho melhor do que a manutencao do estado atual.

## Conclusao

- Nao mexer em Setores nesta rodada.
- Reabrir essa frente apenas com repro concreta de regressao, fail-open ou com cobertura focal melhor que viabilize um corte menor e seguro.