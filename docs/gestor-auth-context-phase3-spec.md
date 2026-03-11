# WD Gestor - Auth Context Phase 3 Specification

## Referencias

- [docs/gestor-auth-context-phase1-compat.md](docs/gestor-auth-context-phase1-compat.md)
- [docs/gestor-auth-context-phase2-compat.md](docs/gestor-auth-context-phase2-compat.md)
- [docs/gestor-route-contract.md](docs/gestor-route-contract.md)
- [docs/gestor-compat-root.md](docs/gestor-compat-root.md)

## 1. Objetivo da fase

Ativar a Fase 3 do AuthContext do WD Gestor de forma incremental, sem refatoracao big-bang, para que o runtime do Gestor passe a operar com:

- identidade global por email em `User`.
- multiplos vinculos por unidade em `user_memberships`.
- distincao explicita entre `global_role` e papel contextual.
- contexto ativo de unidade em sessao para usuarios contextuais.
- selecao de unidade apos login quando houver mais de um vinculo ativo.
- compatibilidade temporaria com `req.session.user`, `req.user`, `/gestor/api/usuario`, `/gestor/api/modulos`, `requireLogin`, `requireRole` e `requireUnitScope`.

Esta fase muda a fonte de verdade de autenticacao do Gestor, mas preserva contratos legados de forma aditiva enquanto a migracao de runtime ainda estiver em curso.

## 2. Fora de escopo

- remover os campos legados `role`, `unidade_id` e `funcionario_id` de `users`.
- alterar `models`, `migrations` ou o backfill da Fase 2.
- alterar o Portal do Morador ou reutilizar seu fluxo como dependencia obrigatoria.
- fazer merge de usuarios por CPF ou nome.
- reescrever todo o stack de auth em `src/modules/gestor/app/db/auth.db.js` para `unitScope` em uma unica entrega.
- eliminar os aliases e compatibilidades de rotas do app raiz.
- mudar o contrato externo das rotas existentes de forma breaking.

## 3. Modelo conceitual

### 3.1 User = identidade global

`User` continua sendo a identidade global do Gestor.

Responsabilidades nesta fase:

- autenticar por email e senha.
- manter credenciais, lockout, remember token e dados globais do usuario.
- manter `global_role` quando o usuario tiver escopo global.

Premissas:

- o email continua unico no dominio Gestor.
- `User` nao representa mais, sozinho, o contexto operacional da unidade.
- `User.role` legado continua existindo temporariamente apenas para compatibilidade e transicao.

### 3.2 UserMembership = vinculo contextual

`UserMembership` em `user_memberships` passa a ser a fonte de verdade para vinculo operacional por unidade.

Campos relevantes ja adotados:

- `user_id`
- `unidade_id`
- `papel_contextual` em `gestor` ou `user`
- `status` em `active` ou `inactive`
- `funcionario_id` quando houver vinculo operacional com funcionario

Regras conceituais:

- um `User` pode ter zero, um ou varios `UserMembership` ativos.
- a restricao unica `user_id + unidade_id` impede dois vinculos paralelos para a mesma unidade.
- `funcionario_id` permanece opcional, mas quando presente identifica o funcionario operacional usado para regras de modulo e perfil.

### 3.3 global_role

`global_role` representa privilegio global e nao depende de contexto ativo de unidade.

Valores previstos nesta fase:

- `master`
- `admin`

Regras:

- `global_role` tem precedencia sobre `user_memberships` para autenticacao e autorizacao global.
- `global_role` nao cria nem exige `UserMembership`.
- `master` e `admin` nao entram em fluxo obrigatorio de selecao de unidade.

### 3.4 Active context

Active context e o contexto de execucao do Gestor para um usuario autenticado sem papel global.

Campos minimos esperados:

- `active_membership_id`
- `active_unidade_id`
- `active_unidade_principal_id`
- `active_papel_contextual`
- `active_funcionario_id`
- `legacy_role`

Mapeamento temporario para compatibilidade legado:

- `global_role=master` -> `legacy_role=master`
- `global_role=admin` -> `legacy_role=admin`
- `papel_contextual=gestor` -> `legacy_role=diretor`
- `papel_contextual=user` -> `legacy_role=user`

Observacao:

- para `master` e `admin`, `active context` pode permanecer nulo sem bloquear login.
- o fallback atual de `requireLogin` para `unidade_principal_id` de `master` pode permanecer como compatibilidade tecnica, mas nao deve ser tratado como selecao de contexto.

## 4. Contrato de sessao proposto

## 4.1 Estrutura canonica

Recomenda-se manter dois niveis de sessao durante a transicao:

- `req.session.gestorAuthContext` como fonte canonica do novo fluxo.
- `req.session.user` como projecao de compatibilidade para codigo legado.

### 4.2 Sessao autenticada sem contexto

Existem dois casos validos de sessao autenticada sem contexto ativo:

- usuario contextual autenticado com mais de um vinculo ativo e selecao pendente.
- usuario com `global_role` autenticado, sem necessidade de unidade ativa.

Exemplo recomendado para selecao pendente:

```json
{
  "user": {
    "id": "64f0...",
    "email": "gestor@empresa.com",
    "role": null,
    "unidade_id": null,
    "unidade_principal_id": null,
    "funcionario_id": null,
    "auth_version": "phase3"
  },
  "gestorAuthContext": {
    "authenticated": true,
    "needs_selection": true,
    "global_role": null,
    "available_memberships": [
      {
        "membership_id": "65a1...",
        "unidade_id": "65b1...",
        "unidade_nome": "Unidade Centro",
        "unidade_codigo": "CENTRO",
        "papel_contextual": "gestor",
        "funcionario_id": "65c1..."
      },
      {
        "membership_id": "65a2...",
        "unidade_id": "65b2...",
        "unidade_nome": "Unidade Norte",
        "unidade_codigo": "NORTE",
        "papel_contextual": "user",
        "funcionario_id": "65c2..."
      }
    ],
    "active_membership_id": null,
    "active_unidade_id": null,
    "active_unidade_principal_id": null,
    "active_papel_contextual": null,
    "active_funcionario_id": null,
    "legacy_role": null
  }
}
```

Exemplo recomendado para `master` ou `admin` sem contexto ativo:

```json
{
  "user": {
    "id": "64f0...",
    "email": "admin@empresa.com",
    "role": "admin",
    "unidade_id": null,
    "unidade_principal_id": null,
    "funcionario_id": null,
    "auth_version": "phase3"
  },
  "gestorAuthContext": {
    "authenticated": true,
    "needs_selection": false,
    "global_role": "admin",
    "available_memberships": [],
    "active_membership_id": null,
    "active_unidade_id": null,
    "active_unidade_principal_id": null,
    "active_papel_contextual": null,
    "active_funcionario_id": null,
    "legacy_role": "admin"
  }
}
```

### 4.3 Sessao autenticada com contexto ativo

Exemplo recomendado para usuario contextual ja selecionado:

```json
{
  "user": {
    "id": "64f0...",
    "email": "usuario@empresa.com",
    "role": "diretor",
    "unidade_id": "65b1...",
    "unidade_principal_id": "65b0...",
    "funcionario_id": "65c1...",
    "auth_version": "phase3"
  },
  "gestorAuthContext": {
    "authenticated": true,
    "needs_selection": false,
    "global_role": null,
    "available_memberships": [],
    "active_membership_id": "65a1...",
    "active_unidade_id": "65b1...",
    "active_unidade_principal_id": "65b0...",
    "active_papel_contextual": "gestor",
    "active_funcionario_id": "65c1...",
    "legacy_role": "diretor"
  }
}
```

### 4.4 Compatibilidade com `req.session.user` legado

Enquanto `requireLogin`, `requireRole`, `requireUnitScope`, `/gestor/api/usuario` e `/gestor/api/modulos` ainda dependerem do contrato legado:

- `req.session.user.id` e `req.session.user.email` continuam obrigatorios.
- `req.session.user.role` passa a ser projecao derivada do contexto ativo ou de `global_role`, e nao mais fonte canonica de autorizacao.
- `req.session.user.unidade_id` e `req.session.user.funcionario_id` devem refletir o contexto ativo quando ele existir.
- `req.user` deve ser reidratado a partir de `gestorAuthContext` antes de cair nos guards legados.
- quando `needs_selection=true`, o runtime nao deve inventar `role`, `unidade_id` ou `funcionario_id` para manter o legado "funcionando"; nessa situacao o correto e bloquear rotas protegidas que dependem de contexto.

Rotas que podem permanecer acessiveis com `needs_selection=true`:

- `GET /gestor/login`
- `POST /gestor/login`
- `GET /gestor/auth/context`
- `POST /gestor/auth/select-unit`
- `POST /gestor/logout`

Resposta esperada para rotas protegidas sem contexto selecionado:

- HTML: redirect para `/gestor/login?step=select`
- JSON: `409 GESTOR_SELECTION_REQUIRED`

## 5. Fluxos

### 5.1 Login com 1 vinculo

1. Buscar `User` por email global.
2. Validar senha, lockout e primeiro acesso com as mesmas regras atuais.
3. Se `global_role` estiver preenchido, seguir o fluxo global e encerrar a resolucao contextual.
4. Carregar `user_memberships` do usuario com `status=active`.
5. Havendo exatamente um vinculo ativo, montar `gestorAuthContext` com esse vinculo como contexto ativo.
6. Projetar `req.session.user` com `role` legado derivado, `unidade_id`, `unidade_principal_id` e `funcionario_id`.
7. Seguir para `/gestor/dashboard` sem etapa adicional.

### 5.2 Login com multiplos vinculos

1. Buscar `User` por email global.
2. Validar senha.
3. Carregar `user_memberships` ativos.
4. Havendo dois ou mais vinculos ativos, criar sessao autenticada sem contexto ativo.
5. Preencher `gestorAuthContext.needs_selection=true` e listar `available_memberships` minimos para a tela de selecao.
6. Nao preencher `req.session.user.role`, `unidade_id` ou `funcionario_id` com valores arbitrarios.
7. No fluxo web, redirecionar para `/gestor/login?step=select`.
8. No fluxo JSON, responder com `step=select` e a lista de unidades disponiveis.

### 5.3 Selecao de unidade

1. Receber `unidade_id` pelo endpoint de selecao.
2. Validar se a sessao esta autenticada e com `needs_selection=true`.
3. Validar se existe `UserMembership` ativo do proprio usuario para a `unidade_id` informada.
4. Resolver `unidade_principal_id` para compatibilidade com o runtime atual.
5. Persistir `active context` na sessao.
6. Projetar `req.session.user` com os campos legados derivados.
7. Limpar `needs_selection`.
8. Redirecionar ou responder JSON com o contexto selecionado.

Observacao:

- o endpoint deve selecionar por `unidade_id`, nao por email ou CPF.
- como `user_id + unidade_id` e unico, `unidade_id` e suficiente como chave externa da selecao.

### 5.4 Troca de unidade

1. Receber `unidade_id` pelo endpoint de troca.
2. Validar se a sessao esta autenticada.
3. Validar se a unidade alvo pertence a um `UserMembership` ativo do proprio usuario.
4. Atualizar `gestorAuthContext` e a projecao legado em `req.session.user`.
5. Limpar caches derivados de menu ou modulos, se existirem.
6. Retornar o novo contexto ativo sem exigir novo login.

### 5.5 Master/admin sem selecao

1. Buscar `User` por email global.
2. Validar senha.
3. Se `global_role` for `master` ou `admin`, concluir autenticacao sem consultar `user_memberships` para decidir acesso global.
4. Criar sessao com `global_role` preenchido, `needs_selection=false` e `active context` nulo.
5. Projetar `req.session.user.role` com o mesmo valor de `global_role`.
6. Manter o comportamento atual de acesso global em `requireRole`.

Observacao:

- `master` e `admin` nao entram no fluxo obrigatorio de selecao de unidade.
- se alguma tela legada ainda depender de `unidade_id` para `master`, o fallback tecnico atual para `unidade_principal_id` pode continuar temporariamente, mas fora do conceito de `active context`.

### 5.6 Usuario sem vinculo ativo

1. Buscar `User` por email global.
2. Validar senha.
3. Se `global_role` estiver vazio e nao houver `UserMembership` com `status=active`, nao criar sessao autenticada para o Gestor.
4. Responder erro explicito de contexto inexistente.

Resposta sugerida:

- HTML: redirect para `/gestor/login?erro=contexto`
- JSON: `403 GESTOR_NO_ACTIVE_MEMBERSHIP`

Este caso deve ser tratado como problema de dados ou provisionamento, e nao como oportunidade para fallback silencioso ao legado.

## 6. Contrato JSON sugerido para novos endpoints

Os endpoints abaixo sao sugeridos como endpoints JSON dedicados do fluxo de autenticacao do Gestor.

### 6.1 GET /gestor/auth/context

Objetivo:

- informar se a sessao esta autenticada.
- informar se ha selecao pendente.
- devolver o `active context` atual.
- devolver as opcoes de unidade quando houver selecao pendente.

Resposta 200, usuario com selecao pendente:

```json
{
  "ok": true,
  "authenticated": true,
  "needsSelection": true,
  "globalRole": null,
  "activeContext": null,
  "memberships": [
    {
      "unidade_id": "65b1...",
      "unidade_nome": "Unidade Centro",
      "unidade_codigo": "CENTRO",
      "papel_contextual": "gestor",
      "funcionario_id": "65c1..."
    }
  ]
}
```

Resposta 200, usuario com contexto ativo:

```json
{
  "ok": true,
  "authenticated": true,
  "needsSelection": false,
  "globalRole": null,
  "activeContext": {
    "unidade_id": "65b1...",
    "unidade_principal_id": "65b0...",
    "papel_contextual": "gestor",
    "legacy_role": "diretor",
    "funcionario_id": "65c1..."
  },
  "memberships": [
    {
      "unidade_id": "65b1...",
      "unidade_nome": "Unidade Centro",
      "unidade_codigo": "CENTRO",
      "papel_contextual": "gestor",
      "funcionario_id": "65c1..."
    },
    {
      "unidade_id": "65b2...",
      "unidade_nome": "Unidade Norte",
      "unidade_codigo": "NORTE",
      "papel_contextual": "user",
      "funcionario_id": "65c2..."
    }
  ]
}
```

Resposta 200, `master` ou `admin`:

```json
{
  "ok": true,
  "authenticated": true,
  "needsSelection": false,
  "globalRole": "admin",
  "activeContext": null,
  "memberships": []
}
```

Erros sugeridos:

- `401 GESTOR_UNAUTHORIZED`
- `500 GESTOR_AUTH_CONTEXT_ERROR`

### 6.2 POST /gestor/auth/select-unit

Objetivo:

- concluir a selecao inicial quando a sessao estiver autenticada sem contexto.

Request sugerido:

```json
{
  "unidade_id": "65b1..."
}
```

Resposta 200 sugerida:

```json
{
  "ok": true,
  "selected": {
    "unidade_id": "65b1...",
    "unidade_principal_id": "65b0...",
    "papel_contextual": "gestor",
    "legacy_role": "diretor",
    "funcionario_id": "65c1..."
  },
  "redirect": "/gestor/dashboard"
}
```

Erros sugeridos:

- `400 GESTOR_INVALID_UNIT_SELECTION`
- `401 GESTOR_UNAUTHORIZED`
- `409 GESTOR_SELECTION_NOT_REQUIRED`
- `409 GESTOR_SELECTION_REQUIRED` quando a sessao estiver inconsistente

### 6.3 POST /gestor/auth/switch-unit

Objetivo:

- trocar o contexto ativo de unidade sem novo login.

Request sugerido:

```json
{
  "unidade_id": "65b2..."
}
```

Resposta 200 sugerida:

```json
{
  "ok": true,
  "selected": {
    "unidade_id": "65b2...",
    "unidade_principal_id": "65b0...",
    "papel_contextual": "user",
    "legacy_role": "user",
    "funcionario_id": "65c2..."
  },
  "reloadModules": true
}
```

Erros sugeridos:

- `400 GESTOR_INVALID_UNIT_SELECTION`
- `401 GESTOR_UNAUTHORIZED`
- `403 GESTOR_GLOBAL_ROLE_NO_SWITCH_REQUIRED`
- `409 GESTOR_SELECTION_REQUIRED`

## 7. Evolucao planejada de /api/usuario

O endpoint existente `GET /gestor/api/usuario` deve continuar respondendo o contrato legado atual e ganhar campos aditivos.

Campos legados a preservar:

- `id`
- `nome`
- `email`
- `role`
- `isMaster`
- `unidade_id`
- `unidade_nome`
- `unidade_codigo`
- `funcionario_id`
- `foto`
- `cpf`
- `telefone`

Campos novos sugeridos:

- `global_role`
- `papel_contextual`
- `needs_selection`
- `auth_context`

Exemplo incremental sugerido:

```json
{
  "success": true,
  "data": {
    "id": "64f0...",
    "nome": "Maria Gestora",
    "email": "maria@empresa.com",
    "role": "diretor",
    "isMaster": false,
    "unidade_id": "65b1...",
    "unidade_nome": "Unidade Centro",
    "unidade_codigo": "CENTRO",
    "funcionario_id": "65c1...",
    "foto": null,
    "cpf": "00000000000",
    "telefone": null,
    "global_role": null,
    "papel_contextual": "gestor",
    "needs_selection": false,
    "auth_context": {
      "source": "membership",
      "active_membership_id": "65a1...",
      "active_unidade_id": "65b1...",
      "active_unidade_principal_id": "65b0...",
      "active_papel_contextual": "gestor",
      "legacy_role": "diretor"
    }
  }
}
```

Regras:

- `role` permanece em valores legados `master`, `admin`, `diretor` ou `user` enquanto os consumers antigos ainda existirem.
- `global_role` e `papel_contextual` expõem a nova semantica sem quebrar o front existente.
- quando `needs_selection=true`, `role`, `unidade_id` e `funcionario_id` podem vir nulos para evitar um contexto falso.

## 8. Evolucao planejada de /api/modulos

O endpoint existente `GET /gestor/api/modulos` deve manter o shape atual `{"data": [...]}` e mudar apenas a origem da decisao de autorizacao quando a Fase 3 estiver ativa.

Fonte de verdade planejada:

- `master` ou `admin`: visao global, como hoje.
- `gestor`: modulos habilitados na `active_unidade_id`.
- `user`: intersecao entre modulos da `active_unidade_id` e modulos da funcao do `active_funcionario_id`.

Regras operacionais:

- o comportamento atual de uniao para `role=user` deve ser aposentado no caminho da Fase 3.
- sem `active context` e sem `global_role`, o endpoint nao deve inferir modulos por `User.unidade_id` legado.
- com `needs_selection=true`, o endpoint deve responder `409 GESTOR_SELECTION_REQUIRED` ou retornar vazio apenas enquanto o flag de enforcement ainda nao estiver ligado.

Motivo:

- hoje existe desalinhamento entre o login do Gestor, que exige contexto funcional coerente, e `/gestor/api/modulos`, que para `role=user` ainda faz uniao de modulos da funcao com modulos da unidade.
- a Fase 3 deve alinhar a API de modulos ao contrato de autorizacao contextual.

## 9. Regras de autorizacao

### 9.1 Gestor contextual (`papel_contextual=gestor`)

- fonte de verdade: `active_unidade_id`.
- permissao de modulo: modulo presente em `Unidade.modulosAcessiveis` da unidade ativa.
- projecao legado temporaria: `req.user.role = diretor`.

### 9.2 User contextual (`papel_contextual=user`)

- fonte de verdade: `active_unidade_id` + `active_funcionario_id`.
- permissao de modulo: intersecao entre `Unidade.modulosAcessiveis` da unidade ativa e `Funcao.modulos_habilitados` da funcao ativa.
- se nao houver `funcionario_id` ou `funcao_id` resolvivel, negar acesso em vez de ampliar permissao.
- projecao legado temporaria: `req.user.role = user`.

### 9.3 Master/admin (`global_role`)

- fonte de verdade: `global_role`.
- permissao de modulo: visao global.
- nao depende de `active context`.
- projecao legado temporaria: `req.user.role = global_role` e `req.user.isMaster = true` apenas para `master`.

### 9.4 Sem contexto ativo

- se nao houver `global_role` e `needs_selection=true`, negar acesso a rotas protegidas que dependem de contexto.
- `requireLogin` deve reconhecer esse estado e bloquear dashboard e APIs de negocio ate a selecao.
- `requireRole` pode continuar sem grande refatoracao, desde que leia a projecao legado ja derivada do `gestorAuthContext`.
- `requireUnitScope` deve continuar priorizando `unidadeId` explicito de query, params ou body; na ausencia desses campos, deve usar `active_unidade_id` antes de cair em `req.user.unidade_id` legado.

## 10. Criterios de aceite

- com todos os flags da Fase 3 desligados, o comportamento do Gestor permanece inalterado.
- usuario com um unico `UserMembership` ativo faz login e cai direto em `/gestor/dashboard` com sessao contextualizada.
- usuario com multiplos `UserMembership` ativos autentica, mas fica em `needs_selection=true` ate escolher a unidade.
- `GET /gestor/auth/context` reflete corretamente sessao global, sessao pendente de selecao e sessao com contexto ativo.
- `POST /gestor/auth/select-unit` ativa a unidade correta e projeta `req.session.user` com os campos legados derivados.
- `POST /gestor/auth/switch-unit` troca o contexto ativo sem novo login.
- `master` e `admin` continuam autenticando sem selecao obrigatoria.
- usuario sem vinculo ativo recebe erro explicito e nao ganha sessao inconsistente.
- `GET /gestor/api/usuario` continua entregando os campos legados e acrescenta os novos campos sem quebrar consumers.
- `GET /gestor/api/modulos` passa a refletir as regras contextuais planejadas.

## 11. Riscos

- risco de dual source of truth durante a transicao, se algum trecho continuar lendo `User.role`, `User.unidade_id` ou `User.funcionario_id` diretamente como se fossem canonicos.
- risco de sessao ficar stale se um `UserMembership` for inativado apos o login; por isso o runtime deve revalidar membership ativo em pontos criticos de troca e reidratacao.
- risco de front legado assumir que `role` e `unidade_id` sempre existem, inclusive quando `needs_selection=true`.
- risco de exposicao de modulos acima do devido se `/gestor/api/modulos` continuar na regra atual de uniao para `role=user`.
- risco operacional no fluxo de criacao automatica de usuario por funcionario: quando o email global ja existir, a fase futura deve adicionar vinculo em `user_memberships`, e nao abortar silenciosamente a expansao multi-unidade.
- risco de inconsistencias se as leituras globais atuais em `auth.db` forem migradas para contexto de unidade sem criterio claro sobre o que permanece global.

## 12. Estrategia de rollout por feature flag

O projeto ja suporta feature flags por variaveis `WDG_FLAG_*`, carregadas em lowercase por `loadFeatureFlagsFromEnv`.

Flags sugeridos para a Fase 3:

- `WDG_FLAG_GESTOR_AUTH_CONTEXT_LOGIN=1`
- `WDG_FLAG_GESTOR_AUTH_CONTEXT_SELECTION=1`
- `WDG_FLAG_GESTOR_AUTH_CONTEXT_API_USUARIO=1`
- `WDG_FLAG_GESTOR_AUTH_CONTEXT_API_MODULOS=1`

Chaves efetivas esperadas em runtime:

- `gestor_auth_context_login`
- `gestor_auth_context_selection`
- `gestor_auth_context_api_usuario`
- `gestor_auth_context_api_modulos`

Sequencia sugerida:

1. Homologacao com `gestor_auth_context_api_usuario` para expor campos novos de forma aditiva.
2. Homologacao com `gestor_auth_context_login` para resolver `global_role`, `UserMembership` e sessao canonica.
3. Homologacao com `gestor_auth_context_selection` para habilitar selecao de unidade, troca de unidade e bloqueio de acesso sem contexto.
4. Homologacao com `gestor_auth_context_api_modulos` para alinhar autorizacao contextual.
5. Producao por etapas, habilitando primeiro `api_usuario`, depois `login`, depois `selection`, depois `api_modulos`.

Regras de rollout:

- cada flag deve ser reversivel sem rollback de banco.
- desligar `gestor_auth_context_selection` deve remover a obrigatoriedade de selecao sem invalidar os dados da Fase 2.
- desligar `gestor_auth_context_api_modulos` deve devolver imediatamente o contrato de modulos ao comportamento anterior.

## 13. Checklist da futura implementacao

1. Criar um service de resolucao de contexto em `src/modules/gestor/app/services/` para autenticar por email global e resolver `global_role` e `UserMembership`.
2. Atualizar o controller de login do Gestor para suportar os tres ramos: global, unico vinculo e multiplos vinculos.
3. Criar os endpoints `GET /gestor/auth/context`, `POST /gestor/auth/select-unit` e `POST /gestor/auth/switch-unit`.
4. Introduzir `req.session.gestorAuthContext` como sessao canonica do novo fluxo.
5. Projetar `req.session.user` a partir do `gestorAuthContext`, sem remover o contrato legado de imediato.
6. Ajustar `requireLogin` para reidratar `req.user` a partir do contexto canonico antes do fallback legado.
7. Manter `requireRole` baseado na projecao legado derivada, evitando refatoracao ampla na mesma entrega.
8. Ajustar `requireUnitScope` para preferir `active_unidade_id` quando nao houver `unidadeId` explicito na requisicao.
9. Evoluir `GET /gestor/api/usuario` com campos aditivos de contexto.
10. Evoluir `GET /gestor/api/modulos` para regras contextuais, removendo a uniao para `role=user` no caminho novo.
11. Garantir que `needs_selection=true` bloqueie dashboard e APIs de negocio, liberando apenas login, logout e endpoints de contexto.
12. Adicionar observabilidade minima para contagem de login global, login com um vinculo, login com multiplos vinculos, selecao de unidade, troca de unidade e falha por ausencia de membership ativo.
13. Validar explicitamente que as compatibilidades do app raiz para `/login`, `/dashboard` e `/api/*` permanecem funcionando durante o rollout.
14. Planejar testes futuros para: single membership, multi membership, select-unit, switch-unit, master, admin, sem membership ativo e sessao stale apos membership inativado.
