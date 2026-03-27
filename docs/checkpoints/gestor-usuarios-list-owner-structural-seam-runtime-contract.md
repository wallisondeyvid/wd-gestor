# Checkpoint: Gestor Usuarios List Owner Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural minima da nova costura controller -> service read-only de renderizacao administrativa de usuarios entre [src/modules/gestor/app/controllers/userController.js](src/modules/gestor/app/controllers/userController.js) e [src/modules/gestor/app/services/usuarios/listUsuariosOwner.service.js](src/modules/gestor/app/services/usuarios/listUsuariosOwner.service.js)
Suite focal: [tests/gestor-usuarios-list-owner-structural-seam.test.js](tests/gestor-usuarios-list-owner-structural-seam.test.js)
Execucao focal: node --test .\tests\gestor-usuarios-list-owner-structural-seam.test.js

## Costura validada

- o owner [listarUsuarios](src/modules/gestor/app/controllers/userController.js) passou a delegar o bundle read-only ao service owner [src/modules/gestor/app/services/usuarios/listUsuariosOwner.service.js](src/modules/gestor/app/services/usuarios/listUsuariosOwner.service.js)
- o controller preserva o caminho feliz com `res.render('usuarios', ...)`
- o service preserva a derivacao da query por `isMaster`
- o service devolve o bundle semantico esperado com `usuarios`, `unidadesFiltradas` e `funcionarios`

## Matriz coberta pela suite

- delegacao do controller ao novo service owner com `isMaster`
- preservacao estrutural da renderizacao final da view `usuarios`
- query global vazia para master
- query com exclusao de `master` para admin nao master
- uso de escopo global nas tres leituras do bundle administrativo

## Limite desta prova

- esta suite nao reabre toggle, delete, create, update, checkUsuarioEmail, statusUsuario, unlockUsuario ou obterUsuarioAtual
- esta suite nao reabre rota, middleware, autenticacao ou contrato HTTP
- esta suite nao substitui qualquer cobertura funcional ampla do corredor administrativo de usuarios

## Decisao final

- a nova costura controller -> service de `listarUsuarios` ficou validada estruturalmente neste recorte
- com essa prova, o primeiro patch minimo desta frente no corredor administrativo de usuarios atinge congelamento intermediario