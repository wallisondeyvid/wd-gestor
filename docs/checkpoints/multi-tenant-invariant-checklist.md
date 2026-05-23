# Checklist documental de invariantes multi-tenant/unitScope

## 1. Identificacao e escopo
- Checklist documental de invariantes multi-tenant/unitScope.
- Escopo apenas documental.
- Este checklist nao autoriza execucao operacional.
- Este checklist nao declara producao pronta.
- Push segue bloqueado ate o encerramento da 4a fase documental.

## 2. Pre-condicoes gerais
- Branch correta confirmada.
- HEAD esperado confirmado.
- Working tree limpa.
- Escopo definido antes de qualquer acao.
- Nenhum comando operacional autorizado.
- Mongo real bloqueado.
- Mongo em memoria manual bloqueado.
- master:set bloqueado.
- seed/reset/cleanup/migration/backfill bloqueados.
- Portal bloqueado.
- Dados reais bloqueados.
- Producao nao pronta.

## 3. Invariantes de contexto operacional

| Invariante | Evidencia documental | Risco se falhar | Gate esperado | Status documental |
| --- | --- | --- | --- | --- |
| req.unitScope deve ser fonte preferencial de contexto operacional. | Modelo auth-context operacional e ledger da Fase 2. | Alto: contexto operacional ambiguo. | req.unitScope tratado como fonte principal. | Pendente |
| unitId deve ser resolvido de forma explicita. | Matriz de dominios e inventario de fallbacks. | Alto: unidade implicita indevida. | unitId resolvido sem inferencia opaca. | Pendente |
| req.user.unidade_id nao deve substituir unitScope quando unitScope for exigido. | Inventario de fallbacks. | Critico: autorizacao contextual concorrente. | req.user.unidade_id apenas como compatibilidade controlada. | Pendente |
| active_unidade_id nao deve substituir unitScope quando unitScope for exigido. | Modelo auth-context operacional. | Alto: contexto ativo tratado como autorizacao autossuficiente. | active_unidade_id refletido via contexto canonicamente resolvido. | Pendente |
| contexto global legitimo deve ser separado de fallback indevido. | Matriz de dominios e modelo operacional. | Critico: bypass tenant indevido. | globais legitimos documentados e separados dos fallbacks. | Pendente |

## 4. Invariantes de master/admin

| Invariante | Evidencia documental | Risco se falhar | Gate esperado | Status documental |
| --- | --- | --- | --- | --- |
| master/admin podem operar em visao global quando nao houver unidade canonica selecionada. | Modelo auth-context operacional. | Medio: perda de ramo global legitimo. | visao global documentada apenas para fluxos legitimos. | Pendente |
| visao global legitima nao deve virar bypass tenant indevido. | Matriz de dominios e inventario de fallbacks. | Critico: ampliacao indevida de autorizacao. | visao global separada de writes contextuais. | Pendente |
| usuario master real wallisondeyvid13@gmail.com e real, sensivel e intocavel. | Ledger da Fase 1 e Fase 2. | Critico: tratamento incorreto de identidade real. | master real protegido e nao tratado como ficticio. | Pendente |
| master:set permanece bloqueado. | Ledger e gates operacionais. | Alto: mutacao indevida de credenciais. | master:set nao autorizado nesta fase. | Pendente |

## 5. Invariantes de fallback e GLOBAL_SCOPE

| Invariante | Evidencia documental | Risco se falhar | Gate esperado | Status documental |
| --- | --- | --- | --- | --- |
| req.session.user e compatibilidade, nao fonte principal. | Inventario de fallbacks. | Alto: sessao legado como fonte material. | req.session.user mantido apenas como projecao. | Pendente |
| GLOBAL_SCOPE precisa estar inventariado e justificado. | Inventario de fallbacks e matriz de dominios. | Alto: escopo global difuso. | cada uso de GLOBAL_SCOPE classificado e justificado. | Pendente |
| fallback tolerado deve ser diferenciado de fallback a eliminar. | Inventario de fallbacks. | Alto: manutencao de ambiguidade. | lista explicita de fallbacks permitidos, temporarios e proibidos. | Pendente |
| fallback implicito de unidade e risco alto. | Ledger da Fase 2. | Alto: tenant errado por inferencia opaca. | fallback implicito tratado como risco e nao como comportamento neutro. | Pendente |

## 6. Invariantes de dominio

| Invariante | Evidencia documental | Risco se falhar | Gate esperado | Status documental |
| --- | --- | --- | --- | --- |
| dominios globais legitimos devem estar documentados. | Matriz de dominios multi-tenant. | Medio: confusao entre catalogo global e operacao contextual. | dominios globais listados explicitamente. | Pendente |
| dominios tenant-aware exigem unitScope. | Matriz de dominios e modelo auth-context. | Critico: acesso contextual sem escopo canonico. | unitScope exigido nos dominios tenant-aware. | Pendente |
| dominios hibridos declaram fronteira entre global e tenant. | Matriz de dominios. | Alto: ambiguidade operacional. | fronteira global/tenant documentada por dominio hibrido. | Pendente |
| Portal/Morador permanece fora de execucao. | Ledger e matriz de dominios. | Alto: acoplamento indevido com corredor sensivel. | sem execucao nem autorizacao operacional em Portal/Morador. | Pendente |

## 7. Invariantes de repositorios tenant-aware

| Invariante | Evidencia documental | Risco se falhar | Gate esperado | Status documental |
| --- | --- | --- | --- | --- |
| repositorios tenant-aware respeitam unitScope. | Modelo operacional e matriz de dominios. | Critico: vazamento de tenant. | unitScope tratado como contrato de acesso. | Pendente |
| acesso a dados por unidade exige contexto explicito. | Modelo auth-context e ledger. | Alto: leitura/escrita fora do escopo esperado. | contexto explicito antes de qualquer acesso contextual. | Pendente |
| fallback global nao deve mascarar ausencia de unitScope. | Inventario de fallbacks. | Critico: global indevido em dominio contextual. | ausencia de unitScope bloqueada ou justificada documentalmente. | Pendente |
| consulta sem contexto deve ser bloqueada ou justificada documentalmente. | Matriz de dominios. | Alto: acesso sem classificacao de escopo. | consulta sem contexto so em ramo global legitimo. | Pendente |

## 8. Invariantes de provisioning

| Invariante | Evidencia documental | Risco se falhar | Gate esperado | Status documental |
| --- | --- | --- | --- | --- |
| colecoes globais e por tenant devem permanecer separadas. | Contrato de provisioning do Gestor. | Critico: mistura de estados globais e contextuais. | separacao global/tenant mantida documentalmente. | Pendente |
| estado persistido real nao deve ser tocado. | Contrato de provisioning e ledger. | Critico: mutacao operacional indevida. | nenhuma alteracao em estado persistido real. | Pendente |
| nenhuma execucao de provisioning neste checklist. | Escopo desta fase no ledger. | Alto: execucao fora de fase propria. | checklist restrito a documentacao. | Pendente |
| qualquer provisioning futuro exige microcorte proprio. | Ledger da Fase 2. | Medio: salto indevido de escopo. | provisioning futuro condicionado a microcorte explicito. | Pendente |

## 9. Invariantes de dados reais e producao

| Invariante | Evidencia documental | Risco se falhar | Gate esperado | Status documental |
| --- | --- | --- | --- | --- |
| dados reais bloqueados. | Ledger e gates operacionais. | Critico: impacto em dados reais. | sem toque em dados reais. | Pendente |
| producao nao pronta. | Ledger da Fase 1 e Fase 2. | Critico: liberacao indevida. | producao segue explicitamente nao pronta. | Pendente |
| nenhuma query real. | Gates operacionais do ledger. | Alto: leitura/escrita fora do escopo documental. | queryExecuted=false. | Pendente |
| nenhum seed/reset/cleanup/migration/backfill. | Gates operacionais do ledger. | Critico: mutacao estrutural indevida. | flags permanecem false. | Pendente |
| nenhum backup/restore/rollback real. | Gates operacionais do ledger. | Alto: operacao fora do escopo documental. | flags operacionais permanecem false. | Pendente |

## 10. Criterios de parada
- Invariante sem evidencia documental.
- Usuario master real tratado como ficticio.
- Producao declarada pronta.
- Tentativa de execucao.
- Tentativa de Mongo real.
- Tentativa de Mongo em memoria.
- Uso de Portal.
- Duvida sobre escopo.

## 11. Criterios de sucesso documental
- Checklist criado.
- Invariantes principais listadas.
- Riscos e gates definidos.
- Master real protegido.
- Producao continua nao pronta.
- Nenhuma execucao feita.
- Push segue bloqueado ate a Fase 4.

## 12. Proximos passos
- Registrar materializacao do checklist no ledger.
- Revisar checklist em microcorte proprio.
- Decidir fechamento da Fase 2.
- Manter push bloqueado ate encerramento da Fase 4.