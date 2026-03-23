# Escalas — canonicalização da listagem de Recursos concluída

## Escopo

- GET /escalas/api/recursos
- ownership canônico movido para recursosApi.js
- remoção do GET duplicado em escalasApi.new.js

## Contrato preservado

- 401 sem sessão com error = "Não autenticado"
- agregação por cluster acessível sem unidadeId
- unidadeId fora do escopo retorna array vazio
- filtro de placa só com 2+ caracteres
- sucesso retorna array puro com:
  - id
  - placa
  - descricao
  - unidadeFormatada
- ordenação por placa
- 500 com error = "erro_interno"

## Arquivos alterados na canonicalização

- src/modules/escalas/app/routes/recursosApi.js
- src/modules/escalas/app/routes/escalasApi.new.js

## Evidências

- commit: 08010cc
- tests/escalas.recursos-lista.test.js verde
- tests/escalas.recursos-detalhe.test.js verde
- suíte ampla/paridade verde conforme validação executada

## Estado final

- recursosApi.js é o dono canônico da listagem
- escalasApi.new.js não mantém mais GET /api/recursos
- GET /api/recursos/:id permaneceu em recursosApi.js
- DELETE /api/recursos/:id permaneceu em recursosApi.js

## Encerramento

- não reabrir a listagem de Recursos para microrefactors locais sem evidência nova
- próxima frente deve ser escolhida por nova auditoria disciplinada