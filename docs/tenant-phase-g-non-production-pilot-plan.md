# Contrato do Piloto Nao Produtivo Multi-DB - Fase G

## 1. Nome

- Contrato do Piloto Nao Produtivo Multi-DB - Fase G.

## 2. Estado herdado

- a Fase F encerrou rollback operacional e piloto sintetico por contrato;
- a Fase G ja tem entrypoint manual minimo interno em `src/shared/db/unitDatabaseRegistryManualEntrypoint.js`;
- o entrypoint segue sem caller real;
- ainda nao houve piloto nao produtivo real;
- ainda nao houve ativacao real.

Leitura operacional herdada:

- o piloto sintetico da Fase F continua sendo apenas harness tecnico;
- o entrypoint manual minimo da Fase G continua sendo apenas funcao interna de validacao e delegacao;
- o piloto nao produtivo futuro continua sem execucao nesta fase documental;
- `resolveConnection` continua como unico decisor de tenant routing;
- o piloto futuro nao autoriza producao, rollout ou superficie operacional nova.

## 3. Definicoes

Piloto sintetico:

- harness ou teste tecnico;
- sem fluxo operacional;
- sem unidade real;
- sem dados reais;
- sem caller real.

EntryPoint manual minimo:

- funcao interna;
- valida pre-condicoes;
- delega ao owner manual;
- retorna relatorio deterministico;
- nao decide tenant routing.

Piloto nao produtivo:

- ciclo operacional controlado;
- sem producao;
- sem dados reais;
- sem trafego real;
- usando unidade sintetica ou espelho controlado;
- dependente do entrypoint interno minimo ja implementado, mas ainda sem caller real.

## 4. Fora de escopo

- producao;
- unidade real;
- dados reais;
- usuarios reais;
- trafego real;
- Portal do Morador;
- rota admin;
- rota interna;
- CLI;
- script;
- job;
- bootstrap;
- preload automatico;
- request path;
- PostgreSQL;
- Condominios amplo;
- Gestor/Core residual;
- Clinica.

## 5. Pre-condicoes obrigatorias

- ambiente nao produtivo;
- unidade sintetica ou espelho controlado;
- dados descartaveis;
- DB dedicado previamente provisionado;
- `databaseKey` e `dbName` coerentes;
- `unidadeId` coerente;
- allowlist unitaria planejada;
- flags esperadas documentadas;
- contexto manual explicito com `source=manual`;
- contexto manual explicito com `approved=true`;
- contexto manual explicito com `actor` nao vazio;
- contexto manual explicito com `reason` nao vazio;
- rollback definido antes do inicio;
- criterios de sucesso definidos;
- criterios de abortar definidos;
- zero dependencia de usuario real;
- zero trafego real.

Leitura operacional:

- piloto sem rollback simples, documentado e previamente testado nao pode ser iniciado;
- allowlist unitaria continua sendo gate obrigatorio e nao atalho;
- qualquer duvida operacional deve degradar para nao executar o piloto.

## 6. Ritual minimo do piloto futuro

1. registrar alvo sintetico ou espelho controlado;
2. registrar pre-condicoes e limites operacionais;
3. executar o entrypoint manual minimo;
4. confirmar o relatorio deterministico do entrypoint;
5. validar que `pending` e `ready` nao abrem tenant;
6. validar que `active` sem allowlist nao abre tenant;
7. validar o caso positivo controlado com todos os gates coerentes;
8. remover um gate obrigatorio e confirmar fallback para `baseConnection`;
9. executar rollback;
10. registrar evidencias;
11. encerrar sem deixar unidade ativa.

## 7. Evidencias obrigatorias

- relatorio do entrypoint;
- estado inicial esperado;
- etapas executadas;
- resultado do owner;
- confirmacao de que `resolveConnection` decidiu routing separadamente;
- confirmacao de fallback;
- confirmacao de rollback;
- confirmacao de ausencia de trafego real;
- confirmacao de ausencia de dados reais;
- confirmacao de ausencia de caller real.

## 8. Criterios de sucesso

- piloto limitado a uma unidade sintetica ou controlada;
- caso positivo controlado abre tenant apenas com todos os gates;
- fallback funciona ao remover gate obrigatorio;
- rollback retorna para `baseConnection`;
- nenhuma superficie operacional nova e criada;
- nenhum dado real e usado;
- nenhum caller real e criado;
- documentacao e testes permanecem coerentes.

## 9. Criterios de abortar

- qualquer uso de unidade real;
- qualquer uso de dado real;
- qualquer dependencia de trafego real;
- qualquer criacao de rota, CLI, script, job, bootstrap ou request path;
- qualquer bypass do owner;
- qualquer escrita direta no registry;
- qualquer tentativa de o entrypoint decidir routing;
- qualquer alteracao em `resolveConnection`;
- qualquer falha de fallback ou rollback.

## 10. Sequencia recomendada apos este contrato

- microcorte atual: contrato documental do piloto nao produtivo;
- proximo microcorte: teste ou harness do piloto nao produtivo usando o entrypoint interno;
- depois: documentacao do harness;
- depois: decisao read-only sobre fechamento da Fase G ou necessidade de contrato adicional;
- baseline completa antes de qualquer publicacao.