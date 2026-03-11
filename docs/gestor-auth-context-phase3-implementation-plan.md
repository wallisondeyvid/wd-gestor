# WD Gestor - Auth Context Phase 3 Implementation Plan

## Referencias

- [docs/gestor-auth-context-phase3-spec.md](docs/gestor-auth-context-phase3-spec.md)
- [docs/gestor-auth-context-phase1-compat.md](docs/gestor-auth-context-phase1-compat.md)
- [docs/gestor-auth-context-phase2-compat.md](docs/gestor-auth-context-phase2-compat.md)
- [docs/gestor-route-contract.md](docs/gestor-route-contract.md)
- [docs/gestor-compat-root.md](docs/gestor-compat-root.md)

## 1. Objetivo

Decompor a Fase 3 do AuthContext do Gestor em etapas pequenas, reversiveis e implementaveis, preservando compatibilidade com o runtime legado enquanto a nova resolucao por `global_role` e `user_memberships` entra em producao por feature flag.

Este plano existe para reduzir risco de rollout e evitar que login, sessao, `/gestor/api/usuario`, `/gestor/api/modulos`, `requireLogin`, `requireRole` e `requireUnitScope` sejam alterados em uma unica entrega.

## 2. Principios de implementacao

- sem big-bang: cada etapa deve ser pequena o suficiente para ser implementada, validada e revertida isoladamente.
- compatibilidade com legado: `req.session.user`, `req.user`, `/gestor/api/usuario`, `/gestor/api/modulos`, `requireLogin`, `requireRole` e `requireUnitScope` continuam funcionando durante a transicao.
- tudo atras de feature flag: nenhum comportamento novo deve ficar ativo por padrao.
- fonte canonica nova, projecao legado temporaria: `req.session.gestorAuthContext` e a sessao canonica; `req.session.user` continua como projecao derivada.
- sem mudar persistencia nesta fase de implementacao: o plano assume `global_role` e `user_memberships` ja existentes por causa das Fases 1 e 2.
- rollout por camadas: primeiro leitura observavel, depois endpoints de contexto, depois login, depois APIs derivadas, depois endurecimento dos guards.
- rollback simples: desligar a flag deve devolver o comportamento anterior sem exigir rollback de banco.

## 3. Ordem de implementacao recomendada

1. Etapa 3.1: AuthContext resolver.
2. Etapa 3.2: `GET /gestor/auth/context`.
3. Etapa 3.3: `POST /gestor/auth/select-unit`.
4. Etapa 3.4: `POST /gestor/auth/switch-unit`.
5. Etapa 3.5: login usando AuthContext.
6. Etapa 3.6: evolucao de `/gestor/api/usuario`.
7. Etapa 3.7: evolucao de `/gestor/api/modulos`.
8. Etapa 3.8: endurecimento progressivo de `requireLogin`, `requireRole` e `requireUnitScope`.

Racional da ordem:

- as etapas 3.1 a 3.4 constroem os blocos de sessao e contexto antes de trocar o login.
- a etapa 3.5 passa a usar os blocos anteriores sem ainda endurecer todos os guards.
- as etapas 3.6 e 3.7 propagam o novo contexto para APIs legadas.
- a etapa 3.8 fecha lacunas residuais e sobe o nivel de enforcement.

## 4. Etapas tecnicas pequenas

## 4.1 Etapa 3.1: AuthContext resolver

### Escopo

- criar um resolver de contexto para o Gestor que receba um `User` autenticado e devolva uma estrutura canonica com:
- `global_role`
- `available_memberships`
- `needs_selection`
- `active_membership_id`
- `active_unidade_id`
- `active_unidade_principal_id`
- `active_papel_contextual`
- `active_funcionario_id`
- `legacy_role`
- criar um helper de projecao de `req.session.user` a partir dessa estrutura.
- criar um helper de lookup de memberships ativos por `user_id`.
- definir a regra unica de mapeamento `papel_contextual -> legacy_role`.

### Fora de escopo

- alterar o controller de login.
- expor endpoints novos.
- endurecer guards.
- alterar `/gestor/api/usuario` ou `/gestor/api/modulos`.

### Arquivos provaveis a tocar

- `src/modules/gestor/app/services/` com um novo service, por exemplo `authContextResolver.js`
- `src/modules/gestor/app/services/` com um helper de sessao, por exemplo `gestorAuthSessionService.js`
- `src/modules/gestor/app/repositories/AuthRepository.js` ou bridge equivalente para leitura de `UserMembership` e `Unidade`
- `src/modules/gestor/app/db/auth.db.js` ou `src/modules/gestor/app/services/authDbBridgeService.js` apenas para leituras aditivas necessarias

### Risco

- medio, porque esta etapa define a semantica canonica que todas as outras vao reutilizar.
- principal risco: duplicar regra entre resolver novo e regras antigas de `authController.js`.

### Feature flag sugerida

- `WDG_FLAG_GESTOR_AUTH_CONTEXT_RESOLVER=1`

### Criterios de aceite

- o resolver distingue corretamente `master` e `admin` de usuarios contextuais.
- o resolver retorna `needs_selection=true` quando houver mais de um membership ativo.
- o resolver retorna `legacy_role=diretor` para `papel_contextual=gestor`.
- o resolver retorna `legacy_role=user` para `papel_contextual=user`.
- a projecao legado preenche `req.session.user` apenas com campos coerentes ao contexto ativo.

### Validacao minima

- executar o resolver manualmente com quatro cenarios: `master`, `admin`, usuario com um membership e usuario com multiplos memberships.
- validar que o payload gerado para sessao nao inventa `unidade_id` ou `funcionario_id` quando `needs_selection=true`.

## 4.2 Etapa 3.2: endpoint GET /gestor/auth/context

### Escopo

- criar o endpoint JSON `GET /gestor/auth/context`.
- expor o estado atual da sessao do Gestor em termos de:
- autenticado ou nao.
- `needsSelection`.
- `globalRole`.
- `activeContext`.
- `memberships` disponiveis para selecao.
- manter o endpoint seguro para uso por front web ou futuras UIs auxiliares.

### Fora de escopo

- concluir selecao.
- trocar unidade.
- mudar login existente.

### Arquivos provaveis a tocar

- `src/modules/gestor/app/controllers/authController.js` ou novo controller dedicado de auth/contexto
- `src/modules/gestor/index.js` ou arquivo de rotas do modulo Gestor para registrar a nova rota
- helper de sessao criado na etapa 3.1

### Risco

- baixo, porque e endpoint de leitura e observabilidade do novo fluxo.
- principal risco: divergir do contrato definido na spec.

### Feature flag sugerida

- `WDG_FLAG_GESTOR_AUTH_CONTEXT_ENDPOINT=1`

### Criterios de aceite

- retorna `401` quando nao houver sessao autenticada.
- retorna `needsSelection=true` quando a sessao estiver autenticada sem contexto.
- retorna `activeContext=null` para `master` e `admin`.
- retorna `memberships` com dados minimos necessarios para selecao.

### Validacao minima

- validar resposta JSON em sessao nao autenticada.
- validar resposta JSON em sessao global.
- validar resposta JSON em sessao contextual ativa.
- validar resposta JSON em sessao autenticada pendente de selecao.

## 4.3 Etapa 3.3: endpoint POST /gestor/auth/select-unit

### Escopo

- criar o endpoint JSON `POST /gestor/auth/select-unit`.
- receber `unidade_id`.
- validar que a sessao esta autenticada e com selecao pendente.
- validar que existe `UserMembership` ativo para a unidade informada.
- gravar `gestorAuthContext` com contexto ativo.
- projetar `req.session.user` para compatibilidade.
- responder com o contexto selecionado e redirecionamento sugerido.

### Fora de escopo

- trocar unidade apos selecao concluida.
- endurecer guards.
- alterar `/gestor/api/modulos`.

### Arquivos provaveis a tocar

- controller de auth/contexto do Gestor
- helper de sessao da etapa 3.1
- rota do modulo Gestor

### Risco

- medio, porque escreve sessao e inaugura o fluxo de selecao.
- principal risco: aceitar `unidade_id` sem validar se pertence ao proprio usuario.

### Feature flag sugerida

- `WDG_FLAG_GESTOR_AUTH_CONTEXT_SELECTION=1`

### Criterios de aceite

- rejeita `unidade_id` invalido.
- rejeita unidade que nao pertence ao usuario autenticado.
- rejeita sessao autenticada que nao esteja em `needs_selection=true`.
- ao selecionar com sucesso, grava `active_unidade_id`, `active_papel_contextual`, `active_funcionario_id` e `legacy_role`.
- ao selecionar com sucesso, `req.session.user.role` passa a refletir o contexto ativo.

### Validacao minima

- testar selecao valida com duas unidades disponiveis.
- testar tentativa de selecao de unidade estranha ao usuario.
- testar chamada repetida apos a primeira selecao concluida.

## 4.4 Etapa 3.4: endpoint POST /gestor/auth/switch-unit

### Escopo

- criar o endpoint JSON `POST /gestor/auth/switch-unit`.
- receber `unidade_id`.
- permitir troca de contexto quando o usuario ja estiver autenticado.
- revalidar membership ativo antes da troca.
- atualizar `gestorAuthContext` e `req.session.user`.
- devolver o novo contexto ativo e um sinal de reload de modulos ou menu.

### Fora de escopo

- substituir completamente o login.
- refatorar `requireRole`.
- refatorar `requireUnitScope`.

### Arquivos provaveis a tocar

- controller de auth/contexto do Gestor
- helper de sessao da etapa 3.1
- rota do modulo Gestor

### Risco

- medio, porque pode expor inconsistencias de sessao stale ou membership inativado apos login.

### Feature flag sugerida

- `WDG_FLAG_GESTOR_AUTH_CONTEXT_SWITCH=1`

### Criterios de aceite

- troca apenas para `unidade_id` presente nos memberships ativos do usuario.
- rejeita troca para `master` e `admin` quando nao fizer sentido operacional.
- atualiza `req.session.user.unidade_id` e `req.session.user.funcionario_id` sem exigir novo login.
- o payload de retorno deixa claro qual contexto ficou ativo.

### Validacao minima

- trocar da unidade A para a unidade B com sucesso.
- falhar ao tentar trocar para unidade inexistente ou inativa.
- falhar ao tentar trocar quando a sessao estiver sem autenticacao.

## 4.5 Etapa 3.5: login usando AuthContext

### Escopo

- integrar o login do Gestor ao resolver da etapa 3.1.
- manter validacao de senha, lockout, remember token e primeiro acesso.
- trocar a decisao de sessao para tres ramos:
- `global_role`
- um unico membership ativo
- multiplos memberships ativos com `needs_selection=true`
- manter compatibilidade com redirects atuais do Gestor.
- introduzir retorno JSON opcional para login com selecao pendente, quando aplicavel.

### Fora de escopo

- endurecer definitivamente todos os guards.
- alterar Portal do Morador.
- reescrever o fluxo de reset de senha ou primeiro acesso.

### Arquivos provaveis a tocar

- `src/modules/gestor/app/controllers/authController.js`
- service resolver da etapa 3.1
- helper de sessao da etapa 3.1
- possivelmente o arquivo de rotas do modulo Gestor para expor o fluxo de selecao na tela de login

### Risco

- alto, porque altera o principal ponto de entrada de autenticacao do Gestor.
- principais riscos: regressao de login simples, conflito com lockout atual e convivencia ruim com `req.session.user` legado.

### Feature flag sugerida

- `WDG_FLAG_GESTOR_AUTH_CONTEXT_LOGIN=1`

### Criterios de aceite

- `master` e `admin` continuam autenticando sem selecao.
- usuario com um unico membership ativo continua indo direto para `/gestor/dashboard`.
- usuario com multiplos memberships ativos autentica, mas nao recebe contexto falso; fica com `needs_selection=true`.
- usuario sem membership ativo recebe erro explicito de contexto.
- com a flag desligada, o login continua usando o comportamento legado.

### Validacao minima

- validar login legado com a flag desligada.
- validar login global com a flag ligada.
- validar login com um membership.
- validar login com multiplos memberships.
- validar login sem membership ativo.

## 4.6 Etapa 3.6: evolucao de /gestor/api/usuario

### Escopo

- manter `GET /gestor/api/usuario` com o shape atual.
- adicionar campos novos de contexto sem remover campos legados.
- passar a refletir `global_role`, `papel_contextual`, `needs_selection` e `auth_context`.
- manter `role` como projecao legado derivada do contexto ativo ou do papel global.

### Fora de escopo

- mudar o shape externo para um contrato completamente novo.
- endurecer acesso a outros endpoints.

### Arquivos provaveis a tocar

- `src/modules/gestor/app/controllers/userController.js`
- possivelmente service/helper de sessao e contexto da etapa 3.1
- `src/shared/routes/userApi.js` apenas se o wiring de rota precisar ler middleware novo

### Risco

- medio, porque o endpoint e muito consumido por front legado.
- principal risco: quebrar consumers que assumem `role`, `unidade_id` ou `funcionario_id` sempre preenchidos.

### Feature flag sugerida

- `WDG_FLAG_GESTOR_AUTH_CONTEXT_API_USUARIO=1`

### Criterios de aceite

- o shape legado continua presente.
- os campos novos aparecem apenas quando a flag estiver ligada.
- `role` continua coerente com `global_role` ou `papel_contextual`.
- quando `needs_selection=true`, o endpoint nao devolve um contexto operacional falso.

### Validacao minima

- comparar resposta antes e depois com a flag desligada.
- validar resposta em sessao global.
- validar resposta em sessao contextual ativa.
- validar resposta em sessao pendente de selecao.

## 4.7 Etapa 3.7: evolucao de /gestor/api/modulos

### Escopo

- manter o endpoint `GET /gestor/api/modulos`.
- alinhar a autorizacao de modulos ao contexto ativo da Fase 3.
- aplicar as regras:
- `master` e `admin`: visao global.
- `gestor`: modulos da unidade ativa.
- `user`: intersecao entre modulos da unidade ativa e modulos da funcao do funcionario ativo.
- remover do caminho novo a regra atual de uniao para `role=user`.

### Fora de escopo

- alterar cadastro de modulos.
- alterar models de `Modulo`, `Funcao`, `Funcionario` ou `Unidade`.

### Arquivos provaveis a tocar

- `src/shared/routes/userApi.js`
- possivelmente service de contexto da etapa 3.1
- possivelmente bridge ou repository usado para resolver `Funcao` e `Unidade`

### Risco

- alto, porque qualquer erro aqui amplia ou bloqueia acesso a funcionalidades reais.
- principal risco: manter comportamento permissivo demais para `role=user`.

### Feature flag sugerida

- `WDG_FLAG_GESTOR_AUTH_CONTEXT_API_MODULOS=1`

### Criterios de aceite

- `master` e `admin` continuam vendo modulos globais.
- `gestor` ve apenas modulos da unidade ativa.
- `user` ve apenas a intersecao entre unidade ativa e funcao ativa.
- sem contexto ativo e sem `global_role`, a resposta nao amplia permissao.

### Validacao minima

- comparar modulos retornados para `master` com o comportamento atual.
- validar usuario `gestor` com modulos habilitados na unidade.
- validar usuario `user` com modulo habilitado na funcao e na unidade.
- validar usuario `user` com modulo habilitado apenas em uma das pontas e garantir ausencia no retorno.

## 4.8 Etapa 3.8: endurecimento progressivo de requireLogin / requireRole / requireUnitScope

### Escopo

- ajustar `requireLogin` para reconhecer `gestorAuthContext` como fonte principal de reidratacao.
- bloquear rotas protegidas quando `needs_selection=true` e nao houver `global_role`.
- manter `requireRole` baseado na projecao legado derivada, evitando refatoracao ampla.
- ajustar `requireUnitScope` para preferir `active_unidade_id` quando nao houver `unidadeId` explicito na requisicao.
- revisar pontos de fallback que ainda leem `req.session.user.unidade_id` ou `req.user.role` como se fossem canonicos.

### Fora de escopo

- reescrever todos os middlewares do Gestor.
- eliminar de imediato todos os fallbacks legados.

### Arquivos provaveis a tocar

- `src/modules/gestor/app/middlewares/requireLogin.js`
- `src/modules/gestor/app/middlewares/requireRole.js`
- `src/modules/gestor/app/middlewares/requireUnitScope.js`
- possivelmente helpers de sessao/contexto da etapa 3.1

### Risco

- alto, porque afeta autenticacao e autorizacao transversal do modulo Gestor.
- principal risco: loop de redirect, `401` indevido em API e regressao de fallback em ambiente com DB intermitente.

### Feature flag sugerida

- `WDG_FLAG_GESTOR_AUTH_CONTEXT_GUARDS=1`

### Criterios de aceite

- com `needs_selection=true`, paginas protegidas redirecionam para `/gestor/login?step=select`.
- com `needs_selection=true`, APIs protegidas retornam `409 GESTOR_SELECTION_REQUIRED`.
- `requireRole` continua aceitando `master` implicitamente onde isso ja era permitido.
- `requireUnitScope` passa a usar `active_unidade_id` antes de cair no legado.
- com a flag desligada, o comportamento anterior permanece.

### Validacao minima

- validar fluxo HTML protegido sem contexto ativo.
- validar fluxo JSON protegido sem contexto ativo.
- validar acesso normal com contexto ativo.
- validar acesso global de `master` e `admin`.

## 5. Dependencias entre etapas

- 3.1 e pre-requisito de 3.2, 3.3, 3.4, 3.5, 3.6, 3.7 e 3.8.
- 3.2 pode entrar antes do novo login para servir como endpoint de observabilidade do contexto.
- 3.3 depende de 3.1 e idealmente de 3.2, porque o client precisa consultar o estado da sessao antes de selecionar.
- 3.4 depende de 3.1 e de 3.3, porque troca de unidade reaproveita a mesma mecanica de projecao do contexto selecionado.
- 3.5 depende diretamente de 3.1 e deve ser entregue junto com 3.2 e 3.3, mesmo que 3.4 fique para logo depois.
- 3.6 depende de 3.1 e ganha valor pleno depois de 3.5.
- 3.7 depende de 3.1 e de 3.5, porque precisa confiar no contexto ativo resolvido pelo login ou pela selecao.
- 3.8 deve ser a ultima etapa, quando login, sessao e APIs de contexto ja estiverem estaveis.

## 6. Estrategia de rollout

### Fase A: observabilidade e leitura segura

- habilitar 3.1 internamente em homologacao.
- habilitar 3.2 para inspecao do estado de sessao sem mudar o login.
- validar payloads e logs com usuarios reais de homologacao.

### Fase B: selecao de contexto isolada

- habilitar 3.3 e 3.4 em homologacao.
- permitir que o novo fluxo de contexto seja exercitado por chamadas controladas sem trocar o login padrao para todos.

### Fase C: troca do ponto de entrada

- habilitar 3.5 em homologacao.
- depois habilitar em producao para um ambiente controlado ou janela operacional definida.

### Fase D: propagacao para APIs legadas

- habilitar 3.6 primeiro.
- habilitar 3.7 depois, porque ele tem impacto direto na permissao efetiva de modulos.

### Fase E: enforcement final

- habilitar 3.8 apenas depois de confirmar que login, selecao e APIs estao estaveis.

Regras de rollout:

- nunca habilitar 3.7 e 3.8 antes de 3.5.
- nunca habilitar 3.8 antes de existir rota funcional para selecao inicial.
- qualquer rollout em producao deve acontecer com comparacao entre comportamento com flag on e off.

## 7. Estrategia de rollback

- rollback primario: desligar a feature flag da etapa afetada.
- rollback secundario: desligar a etapa imediatamente dependente quando a etapa anterior se mostrar instavel.
- rollback de 3.5: desligar `gestor_auth_context_login` e voltar ao login legado.
- rollback de 3.6: desligar `gestor_auth_context_api_usuario` e voltar ao payload anterior.
- rollback de 3.7: desligar `gestor_auth_context_api_modulos` e voltar a logica anterior de modulos.
- rollback de 3.8: desligar `gestor_auth_context_guards` para remover o enforcement novo e voltar aos guards atuais.

Limites do rollback:

- o plano pressupoe rollback de comportamento, nao de dados.
- `global_role` e `user_memberships` continuam existindo porque pertencem as Fases 1 e 2.
- qualquer bug de semantica da sessao deve ser corrigido por desligamento de flag, nao por alteracao manual de banco.

## 8. Testes minimos sugeridos por etapa

### Etapa 3.1

- resolver para `master`.
- resolver para `admin`.
- resolver para usuario com um membership ativo.
- resolver para usuario com multiplos memberships ativos.
- resolver para usuario sem membership ativo.

### Etapa 3.2

- `GET /gestor/auth/context` sem sessao.
- `GET /gestor/auth/context` com sessao global.
- `GET /gestor/auth/context` com sessao contextual ativa.
- `GET /gestor/auth/context` com `needs_selection=true`.

### Etapa 3.3

- `POST /gestor/auth/select-unit` com unidade valida.
- `POST /gestor/auth/select-unit` com unidade invalida.
- `POST /gestor/auth/select-unit` sem sessao.
- `POST /gestor/auth/select-unit` quando `needs_selection=false`.

### Etapa 3.4

- `POST /gestor/auth/switch-unit` com troca valida.
- `POST /gestor/auth/switch-unit` para unidade nao pertencente ao usuario.
- `POST /gestor/auth/switch-unit` sem sessao.
- `POST /gestor/auth/switch-unit` para `master` ou `admin`.

### Etapa 3.5

- login legado com flag desligada.
- login com `global_role=master`.
- login com `global_role=admin`.
- login com um membership.
- login com multiplos memberships.
- login sem membership ativo.
- login com primeiro acesso ainda exigido.

### Etapa 3.6

- `GET /gestor/api/usuario` com flag desligada.
- `GET /gestor/api/usuario` com sessao global.
- `GET /gestor/api/usuario` com sessao contextual ativa.
- `GET /gestor/api/usuario` com `needs_selection=true`.

### Etapa 3.7

- `GET /gestor/api/modulos` para `master`.
- `GET /gestor/api/modulos` para `admin`.
- `GET /gestor/api/modulos` para `gestor` com modulo habilitado na unidade.
- `GET /gestor/api/modulos` para `user` com intersecao valida.
- `GET /gestor/api/modulos` para `user` sem intersecao.

### Etapa 3.8

- `requireLogin` com `needs_selection=true` em pagina HTML.
- `requireLogin` com `needs_selection=true` em API JSON.
- `requireRole` com `master` implicito.
- `requireUnitScope` preferindo `active_unidade_id`.

## 9. Definicao de pronto da Fase 3

Considerar a Fase 3 pronta quando todos os itens abaixo forem verdadeiros:

- existe um resolver canonico de contexto reutilizado por login, endpoints de contexto e APIs derivadas.
- o login do Gestor usa `global_role` e `user_memberships` quando a flag estiver ligada.
- usuarios com multiplos memberships ativos conseguem selecionar unidade sem novo login.
- usuarios com contexto ativo conseguem trocar unidade com seguranca.
- `GET /gestor/auth/context` expõe o estado real da sessao.
- `GET /gestor/api/usuario` continua compativel com o legado e passa a expor o novo contexto.
- `GET /gestor/api/modulos` deixa de usar a regra permissiva atual de uniao para `role=user` no caminho novo.
- `requireLogin`, `requireRole` e `requireUnitScope` aceitam a nova fonte canonica sem quebrar o legado com as flags desligadas.
- o rollout pode ser feito e revertido por feature flag, sem alterar banco.
- os cenarios minimos de `master`, `admin`, single membership, multi membership, sem membership e `needs_selection=true` estao validados.
