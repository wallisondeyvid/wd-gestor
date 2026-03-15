## POST /gestor/api/usuarios

Status: checkpointado
Classificacao: MICRO_PASSO_SEGURO consumido

## Objetivo encerrado

- Consolidar documentalmente o contrato mínimo real de POST /gestor/api/usuarios no caminho montado atual do app.
- Encerrar o micro-passo sem patch de produção, sem nova cobertura além da suíte focal e sem abrir fluxos mais amplos de criação de usuário, membership, funcionário, mailer ou bridge.

## Caminho canônico real

- Caminho canônico: POST /gestor/api/usuarios.
- Mount real: src/modules/gestor/app/gestor-app.js monta userApiRouter no app do Gestor.
- Owner compartilhado: src/shared/routes/userApi.js.
- Rota viva montada: router.use('/api', requireLogin) seguido de router.post('/api/usuarios', criarUsuario).
- Handler vivo: src/modules/gestor/app/controllers/userController.js -> criarUsuario.

## Estado atual

- O endpoint público permanece exposto pelo mount real de userApiRouter no app do Gestor.
- requireLogin é aplicado ao bloco /api antes da rota de POST /api/usuarios.
- A rota não aplica requireRole no router.
- O bloqueio 403 para papel não permitido vem do guard interno de criarUsuario, que exige req.user.isMaster ou req.user.role === 'admin'.
- Sem patch de produção nesta rodada.

## Contrato mínimo agora congelado

- 401 sem sessão: success=false, error="Não autenticado", code="UNAUTHORIZED".
- 403 para autenticado sem papel permitido: success=false, error="Acesso negado", code="FORBIDDEN".
- Ramos já sustentados na mesma suíte focal:
  - 201 cria usuário novo com membership contextual.
  - 201 reaproveita o mesmo User e adiciona membership em outra unidade.
  - 400 quando o usuário já está vinculado à mesma unidade, com code="USER_MEMBERSHIP_DUPLICATE".

## Cobertura validada

- Arquivo de teste: tests/gestor-user-create-or-link.test.js.
- Cenário novo de gates mínimos:
  - POST /gestor/api/usuarios aplica gates mínimos de autenticação e autorização no caminho montado real.
- Ramos já existentes na mesma suíte focal:
  - POST /gestor/api/usuarios cria usuário novo com membership contextual.
  - POST /gestor/api/usuarios reaproveita o mesmo User e adiciona membership em outra unidade.
  - POST /gestor/api/usuarios falha claramente quando o usuário já está vinculado à mesma unidade.
- Execução focal validada: node --test tests/gestor-user-create-or-link.test.js.
- A origem do 401 permanece em requireLogin.
- A origem do 403 permanece no guard interno do controller.

## Conclusão

- POST /gestor/api/usuarios tem contrato mínimo inicial suficientemente congelado no caminho montado real do app.
- O micro-passo seguro desta rodada foi consumido apenas fechando os gates mínimos do endpoint.
- Não houve alteração em produção.
- O restante do endpoint sobe para EXIGE_AUDITORIA_MAIOR.