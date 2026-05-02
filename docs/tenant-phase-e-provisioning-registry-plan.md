# Fase E — Provisionamento e Registry Multi-DB por Unidade

## 1. Objetivo da Fase E

- Fechar o contrato passivo de provisionamento e registry por unidade para o WD Gestor.
- Preparar futura ativacao multi-db por unidade com baixo blast radius e rollback simples.
- Preservar o comportamento atual quando tudo estiver desligado.
- Nao implementar nem ativar multi-db nesta fase documental.

Checkpoint curto de execucao ja concluido:

- o Microcorte 1 da Fase E introduziu apenas a leitura passiva inicial do registry em `resolveConnection`, protegida por `WD_MULTI_DB_REGISTRY_READ`;
- registry ausente para unidade valida continua degradando para `baseConnection`, sem `useDb` e sem handshake;
- o Microcorte 2 da Fase E passou a tratar registry presente com `readiness.ready=false` como fallback obrigatorio para `baseConnection`, ainda sem ativacao operacional;
- o Microcorte 3 da Fase E passou a tratar registry tecnicamente pronto, mas sem `activation.active`, como fallback obrigatorio para `baseConnection`, sem ativar tenant db;
- o Microcorte 4 da Fase E caracterizou o primeiro caso positivo controlado: com `WD_MULTI_DB`, `WD_MULTI_DB_REGISTRY_READ`, registry presente com `readiness.ready=true`, `activation.active=true` e allowlist efetiva para a unidade, `resolveConnection` passa a usar tenant db, reutilizando cache e sem exigir alteracao de producao;
- o Microcorte 5 da Fase E caracterizou o mesmo corredor positivo com `WD_USERDB_HANDSHAKE` ligado, preservando o handshake atual como comportamento nao-bloqueante e provando que o ping ocorre uma unica vez no caminho positivo reaproveitado;
- nenhum dominio, wrapper, `api.db.js`, `auth.db.js`, PostgreSQL ou `user_memberships` entrou no escopo deste primeiro corte;
- `readiness.ready` fica consolidado como prontidao tecnica e `activation.active` como liberacao operacional explicita; a allowlist atual permanece como gate operacional obrigatorio; com os cinco microcortes executaveis atuais, a primeira subfase passiva do registry fica encerrada parcialmente e qualquer sequencia sobre persistencia ou leitura real do registry deve recomecar em modo document-first/read-only.

Nota curta da proxima subfase:

- a proposta document-first para persistencia e leitura real passiva do registry multi-db fica registrada em [tenant-phase-e-registry-persistence-plan.md](tenant-phase-e-registry-persistence-plan.md);
- o desenho proposto mantem Mongo global/base como ponto inicial de persistencia, mantem `WD_MULTI_DB_REGISTRY_READ` como gate de leitura e preserva `baseConnection` como fallback obrigatorio em qualquer erro ou duvida.


## 2. Base tecnica ja existente

Ja existem, no estado atual do projeto:

- `unitScope` como descritor minimo de escopo por unidade ou global.
- `assertTenantScope` como guarda da borda multi-tenant.
- `resolveConnection` como fronteira central de resolucao de conexao.
- `connectionFactory` como trilho de conexoes base e tenant com rastreamento.
- `resolveModel` como fronteira central de resolucao de models por conexao.
- `modelRegistry` como reaproveitamento de models por connection.
- testes de arquitetura em `tests/architecture/resolveConnection_multiDbFlag.test.js` cobrindo flag OFF/ON, allowlist, cache e handshake.
- contrato de provisioning consolidado em `docs/gestor-provisioning-contract.md`.

Leitura executiva da base atual:

- a infraestrutura tenant-aware ja existe e nao precisa ser reaberta dominio por dominio para a proxima fase;
- o que falta e o contrato operacional explicito entre unidade e database dedicado.

## 3. Gap atual

Falta consolidar, antes de qualquer implementacao passiva:

- registry canonico por unidade;
- vinculo explicito `unidade -> databaseKey/dbName`;
- estados formais de provisionamento e ativacao;
- readiness tecnica separada de ativacao;
- gates explicitos para leitura passiva e ativacao futura;
- rollback padrao para `baseConnection`;
- suite minima de testes antes da primeira implementacao passiva.

Leitura executiva do gap:

- hoje o projeto ja sabe resolver conexao tenant por unidade, mas ainda depende de flag e allowlist de ambiente como fonte principal do roteamento;
- a Fase E existe para introduzir o contrato do registry sem alterar o runtime atual.

## 4. Schema minimo do registry por unidade

O registry por unidade deve conter, no minimo:

- `tenantBase`
- `unidadeId`
- `databaseKey`
- `dbName`
- `status`
- `readiness.ready`
- `readiness.reason`
- `readiness.checkedAt`
- `routingMode`
- `configVersion`
- `provisioningVersion`
- `activation.allowlisted`
- `activation.active`
- `activation.activatedAt`
- `activation.deactivatedAt`
- `lastHandshake.status`
- `lastHandshake.at`
- `lastError`
- `createdAt`
- `updatedAt`

Exemplo minimo de payload:

```json
{
  "tenantBase": "unidade",
  "unidadeId": "65f2aaaaaaaaaaaaaaaaaaaa",
  "databaseKey": "wdgestor_unit_65f2aaaaaaaaaaaaaaaaaaaa",
  "dbName": "wdgestor_unit_65f2aaaaaaaaaaaaaaaaaaaa",
  "status": "ready",
  "readiness": {
    "ready": true,
    "reason": null,
    "checkedAt": "2026-05-02T12:00:00.000Z"
  },
  "routingMode": "base",
  "configVersion": "unit-db-registry-v1",
  "provisioningVersion": "unit-tenant-v1",
  "activation": {
    "allowlisted": false,
    "active": false,
    "activatedAt": null,
    "deactivatedAt": null
  },
  "lastHandshake": {
    "status": "not_run",
    "at": null
  },
  "lastError": null,
  "createdAt": "2026-05-02T12:00:00.000Z",
  "updatedAt": "2026-05-02T12:00:00.000Z"
}
```

Regras de interpretacao:

- `databaseKey` e `dbName` podem coincidir inicialmente, mas nao devem ser tratados como sinonimos conceituais obrigatorios.
- `status` descreve o estado operacional agregado.
- `readiness` descreve aptidao tecnica.
- `activation` descreve elegibilidade e ativacao de roteamento.
- `routingMode` define o destino efetivo esperado da unidade (`base` ou `tenant`).

## 5. Estados de provisionamento

- `not_configured`: unidade existe, mas ainda nao possui registry valido.
- `pending`: registry criado, aguardando provisionamento tecnico.
- `provisioning`: provisionamento do database em andamento.
- `ready`: provisionamento concluido e validado, mas sem ativacao de roteamento.
- `active`: unidade explicitamente ativada para roteamento tenant.
- `failed`: houve falha de provisionamento, handshake ou consistencia.
- `rollback_required`: foi detectado estado inconsistente que exige retorno para `baseConnection`.
- `disabled`: unidade explicitamente mantida fora do roteamento tenant.

Regra central:

- `ready` nao significa `active`.
- `active` exige gates explicitos.
- o default operacional da fase continua sendo `baseConnection`.

## 6. Fluxo operacional

Fluxo minimo recomendado:

1. criar unidade no fluxo atual;
2. criar snapshot e eventos de provisioning no tenant base global;
3. criar ou atualizar registry com `status=pending`, `readiness.ready=false` e `routingMode=base`;
4. provisionar o database da unidade;
5. registrar resultado tecnico e handshake;
6. marcar registry como `ready` quando a validacao tecnica passar;
7. ativar a unidade apenas por gates explicitos;
8. marcar `active` e `routingMode=tenant` somente apos decisao deliberada de ativacao;
9. em falha ou rollback, retornar para `routingMode=base` e manter o registry como metadado.

Leitura operacional obrigatoria:

- criar unidade nao ativa roteamento tenant automaticamente;
- provisionamento bem-sucedido nao ativa roteamento tenant automaticamente;
- sem gates positivos, a unidade continua em `baseConnection`.

## 7. Persistencia do registry

Recomendacao contratual:

- persistir o registry no tenant base global;
- usar colecao propria para o registry por unidade;
- manter vinculo semantico com o provisioning ja existente, sem fundir todo o registry dentro do snapshot de provisioning;
- nao usar variavel de ambiente como unica fonte de verdade;
- nao depender apenas da convencao de `dbName` para determinar readiness ou ativacao.

Leitura executiva da persistencia:

- `unit_provisioning_status` e `unit_provisioning_events` continuam sendo o contrato do provisioning;
- o registry multi-db deve ser uma camada propria de roteamento e readiness;
- o snapshot de provisioning pode referenciar o registry, mas nao precisa absorver todos os campos de ativacao e handshake.

## 8. Integracao futura com resolveConnection.js

Ordem logica recomendada para a futura integracao:

1. `WD_MULTI_DB` OFF retorna `baseConnection` imediatamente;
2. validar `unitScope` e `unidadeId` antes de qualquer decisao tenant;
3. com `WD_MULTI_DB` ON, ler o registry por unidade;
4. registry ausente, invalido ou `not_ready` retorna `baseConnection`;
5. registry `ready` mas sem `activation.active` ou sem allowlist efetiva retorna `baseConnection`;
6. somente `ready + active + allowlisted` pode levar a tenant db;
7. cache e handshake ficam depois da decisao efetiva de `dbName`;
8. `GLOBAL_SCOPE` nunca pode cair em tenant db.

Recomendacao de encaixe tecnico futuro:

- a leitura do registry deve ocorrer em `resolveConnection.js` antes do roteamento final por `dbName`;
- a decisao por allowlist atual deve continuar podendo bloquear a ativacao, mesmo com registry `ready`;
- falha na leitura do registry deve degradar para `baseConnection`, nunca para tenant db.

## 9. Flags e gates

Flags e gates minimos do contrato:

- `WD_MULTI_DB`: kill switch global de comportamento multi-db.
- `WD_MULTI_DB_REGISTRY_READ`: gate futuro de leitura passiva do registry, sem ativacao de roteamento.
- `WD_MULTI_DB_ALLOWLIST`: allowlist operacional por unidade.
- `WD_MULTI_DB_REGISTRY_ENFORCED`: gate futuro para tornar a leitura do registry parte obrigatoria da decisao tenant.
- `WD_USERDB_HANDSHAKE`: gate do handshake tecnico de database tenant.
- `activation.active` no registry como sinal explicito de ativacao por unidade.

Leitura operacional dos gates:

- `WD_MULTI_DB` desligado deve preservar integralmente o comportamento atual;
- allowlist continua podendo existir como gate de rollout;
- `activation.active` nao substitui o kill switch global;
- nenhuma unidade vai para tenant db apenas por existir no registry.

## 10. Rollback

Rollback minimo recomendado:

- desligar `WD_MULTI_DB`;
- remover unidade da allowlist;
- marcar `activation.active=false`;
- retornar `routingMode=base`;
- manter o registry como metadado inerte;
- nao exigir rollback dominio por dominio;
- nao exigir rollback de repository ou model.

Regra de rollback:

- o estado seguro de retorno e sempre `baseConnection`.
- rollback deve ser compativel com cache, handshake e conexoes ja abertas sem exigir reescrita de dominio.

## 11. Cenarios de falha

Os seguintes cenarios devem ser documentados e testados antes de qualquer implementacao passiva:

- registry ausente;
- registry inconsistente;
- `ready=false`;
- `active=false`;
- handshake falha;
- conexao tenant indisponivel;
- cache com entrada antiga;
- rollback durante janela de requests;
- `GLOBAL_SCOPE` tentando cair em tenant db;
- `dbName` divergente de `databaseKey`;
- `configVersion` incompativel;
- erro de leitura do registry.

Regra de seguranca:

- em qualquer falha de contrato, readiness ou ativacao, a resolucao deve cair para `baseConnection` ou bloquear a ativacao futura;
- nunca deve haver promocao implicita para tenant db em cenario degradado.

## 12. Suite minima de testes antes de implementacao passiva

Testes minimos esperados:

- `resolveConnection` com flag OFF retorna base;
- flag ON com registry ausente retorna base;
- unidade com `ready=false` retorna base;
- unidade com `ready=true` mas nao allowlisted retorna base;
- unidade `ready + active + allowlisted` roteia para tenant db;
- rollback retorna base;
- `GLOBAL_SCOPE` preserva base;
- cache permanece preservado;
- handshake permanece preservado;
- erro de leitura do registry cai para base;
- `dbName` invalido nao ativa tenant;
- mudanca de `activation state` altera o roteamento de forma controlada.

Ponto de partida existente:

- a suite `tests/architecture/resolveConnection_multiDbFlag.test.js` ja cobre o trilho OFF/ON, allowlist, cache e handshake;
- a implementacao passiva futura deve expandir essa cobertura, nao substitui-la.

## 13. Fora de escopo

Ficam expressamente fora da Fase E:

- rollout multi-db real;
- PostgreSQL;
- `user_memberships` como runtime pleno;
- BaseRepository nova ampla;
- limpeza oportunista de `api.db.js` e `auth.db.js`;
- wrappers `pagesRouter.js` e `api.js`;
- scripts produtivos irreversiveis;
- alteracao dominio por dominio;
- migracao HTTP;
- push agora.

## 14. Sequencia segura posterior

Sequencia segura recomendada apos este documento:

1. fechar o documento contratual da Fase E;
2. revisar o desenho e os gates;
3. implementar registry passivo;
4. adicionar testes passivos;
5. implementar leitura passiva em `resolveConnection` atras de flag;
6. validar fallback integral para `baseConnection`;
7. somente depois discutir ativacao controlada.

Leitura executiva desta sequencia:

- o passo seguinte a este checkpoint continua sendo documental e de revisao;
- qualquer implementacao futura deve nascer primeiro como leitura passiva e fallback-safe;
- nenhuma ativacao deve ocorrer antes da suite minima e do rollback estarem fechados.