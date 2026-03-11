# WD Gestor - Auth Context Phase 2 Compatibility

## O que a fase 2 faz

- Preenche `global_role` para users legados com `role=master` ou `role=admin`.
- Cria registros em `user_memberships` para users legados com papel contextual e `unidade_id` valido.
- Mantem o legado como fonte de verdade de runtime nesta etapa.

## O que continua NAO ativado

- Login com selecao de unidade.
- Leitura de `user_memberships` em middlewares ou APIs.
- Resolucao de papel efetivo por contexto no runtime.
- Qualquer alteracao no Portal do Morador.

## O que a migration NAO faz

- Nao remove campos legados.
- Nao faz merge por CPF.
- Nao faz merge por nome.
- Nao corrige conflitos de forma silenciosa.
- Nao altera login, front ou guards.
