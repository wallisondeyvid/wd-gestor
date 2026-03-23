# Gestor - contrato runtime das mutações admin de usuários

Status: checkpointado
Classificacao: FASE_MAIOR_DELIBERADA

## Objetivo encerrado

- Congelar documentalmente o contrato runtime real dos caminhos montados de mutações admin de usuários no Gestor.
- Registrar o owner efetivo atual observado por precedência de montagem e protegido por suíte dedicada.

## Caminhos auditados

- POST /gestor/api/usuarios/:id/update
- POST /gestor/api/usuarios/:id/toggle
- POST /gestor/api/usuarios/:id/delete

## Evidência executável

- Suite dedicada: tests/gestor-usuarios-admin-runtime-contract.test.js
- Execução focal validada: node --test .\tests\gestor-usuarios-admin-runtime-contract.test.js
- Resultado validado: 17 testes, 17 passes, 0 falhas

## Wiring real relevante

- src/modules/gestor/app/gestor-app.js monta usuarioRouter antes de userApiRouter.
- src/modules/gestor/app/routes/usuario.js registra os três caminhos auditados.
- src/shared/routes/userApi.js também registra os mesmos caminhos, mas fica montado depois no app.

## Owner runtime efetivo atual

- Owner runtime efetivo atual por precedência: router legado.
- Router efetivo atual: src/modules/gestor/app/routes/usuario.js
- O shared router permanece presente no código, mas não define o contrato público vencedor desses três caminhos no wiring atual.

## Contrato runtime congelado

### POST /gestor/api/usuarios/:id/update

- Sem sessão: 401 com texto simples de autenticação.
- Sem papel suficiente: 403 com texto simples de acesso negado.
- Id inexistente: 404 com texto simples.
- role=user ou role=diretor sem unidade_id: 400 com texto simples.
- Caso feliz por POST tradicional: redirect/PRG 303 para /gestor/usuarios.
- Caso feliz com XHR: 200 JSON com success=true, id e updated=true.

### POST /gestor/api/usuarios/:id/toggle

- Sem sessão: 401 com texto simples de autenticação.
- Sem papel suficiente: 403 com texto simples de acesso negado.
- Alvo comum com admin e XHR: 200 JSON com success=true, id e ativo.
- Tentativa sobre usuário master: 403 com texto simples.
- Id inexistente: 404 com texto simples.

### POST /gestor/api/usuarios/:id/delete

- Sem sessão: 401 com texto simples de autenticação.
- Admin autenticado preserva o comportamento runtime atual observado: 403 no owner efetivo atual.
- Master excluindo usuário comum com XHR: 200 JSON com success=true, deleted=true e id.
- Autoexclusão: 403 com texto simples.
- Exclusão de usuário master: 403 com texto simples.
- Id inexistente: 404 com texto simples.

## Observações de runtime relevantes

- O corredor público vencedor não segue o envelope padronizado do shared router para esses caminhos.
- update tradicional preserva semântica PRG no caso feliz.
- toggle e delete em fluxo de tela atual operam com XHR e observam payload JSON do owner legado no caso feliz.
- Para representar fielmente o runtime atual, a suíte usou papel diretor como perfil autenticável porém insuficiente nas asserções de autorização negativa.

## Conclusão

- O contrato runtime real dos três caminhos montados ficou congelado por suíte dedicada no estado atual da branch.
- O corredor não configura microcorte seguro neste ponto.
- A frente permanece como fase maior deliberada de canonicalização entre router legado e shared router.
- Qualquer mudança futura deve preservar primeiro o contrato público agora congelado ou vir acompanhada de nova decisão deliberada de canonicalização.