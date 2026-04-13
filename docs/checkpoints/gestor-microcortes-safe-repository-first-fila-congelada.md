# Checkpoint: Gestor Microcortes Safe Repository-First Fila Congelada

## Snapshot confirmado

- Branch auditada: migration/refactor-core.
- HEAD auditado: 6dc94ba.
- Worktree limpa no momento da decisao.
- Estado macro do modulo: Gestor permanece em modo hibrido controlado, mas a trilha de microcortes pequenos repository-first entrou em retorno decrescente neste snapshot.

## Guardrails que encerraram a fila

- Services do Gestor nao podem importar repositories diretamente.
- Services do Gestor nao podem importar usecases diretamente.
- Services do Gestor nao podem importar db diretamente, exceto pelas fachadas legacy explicitamente permitidas.
- Com essa combinacao, os corredores read-only remanescentes nao conseguem mais reduzir bridge de forma material sem bater em guardrail estrutural.

## Corredores congelados

- widget settings GET de feedback
- provisioning read-only de unidade
- usuarios check-email
- usuarios status/lock state
- usuarios listagem administrativa
- usuarios bloqueados

## Motivo do congelamento

- Os microcortes pequenos e seguros desse conjunto ja foram consumidos ou provados como inviaveis no snapshot atual.
- Os owners restantes ou ja chegaram ao menor ponto util, ou ainda dependem de fronteiras que so poderiam ser reduzidas via import direto de repository, usecase ou db em services do Gestor.
- Insistir agora tende a gerar apenas dois resultados ruins: cortes cosmeticos sem ganho arquitetural real ou tentativas invalidas barradas pelos guardrails estruturais ativos.

## Criterio para reabrir a fila

- Reabrir apenas se houver uma nova fachada permitida para services do Gestor consumir acesso canonico sem importar repository, usecase ou db diretamente.
- Alternativamente, reabrir apenas se a decisao arquitetural do modulo mudar explicitamente e permitir uma fase macro controlada acima do nivel de microcorte atual.
- Na ausencia dessas condicoes, a fila de microcortes pequenos repository-first deve permanecer congelada.

## Proxima etapa recomendada

- Subir o nivel da migracao do Gestor para uma fase macro deliberada, em vez de insistir em outro microcorte igual.
- A proxima rodada util deve redefinir a fronteira arquitetural permitida para a reducao da bridge, ou escolher um recorte maior explicitamente autorizado e validado contra os contratos ja congelados.