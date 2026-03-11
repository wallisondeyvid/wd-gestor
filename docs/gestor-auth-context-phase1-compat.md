# WD Gestor - Auth Context Phase 1 Compatibility

## O que continua legado

- O login continua usando apenas a colecao `users` e os campos legados `role`, `unidade_id` e `funcionario_id`.
- Middlewares de autenticacao e autorizacao nao foram alterados nesta fase.
- Endpoints existentes como `/api/usuario` e `/api/modulos` continuam sem leitura da nova estrutura.
- Portal do Morador permanece completamente fora desta fase.

## O que e novo

- Foi adicionada a colecao `user_memberships` para representar vinculos contextuais por unidade.
- Foi adicionado o campo opcional `global_role` em `User` para preparar a separacao futura entre papel global e papel contextual.
- A migration desta fase apenas cria colecao e indices de suporte, sem backfill e sem alterar documentos existentes.

## O que ainda NAO foi ativado

- Login com selecao de unidade.
- Troca de unidade em sessao.
- Leitura de vinculos contextuais no runtime.
- Resolucao de papel efetivo a partir de `user_memberships`.
- Migracao de dados legados para a nova estrutura.
