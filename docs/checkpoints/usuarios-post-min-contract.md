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
- 409 de seleção pendente no middleware: success=false, authenticated=true, error="Seleção de unidade pendente", code="GESTOR_SELECTION_REQUIRED", needsUnitSelection=true e redirect="/gestor/login?step=select".
- 400 no pré-efeito principal com e-mail ausente: error="E-mail obrigatório", code="EMAIL_REQUIRED" e nenhum efeito colateral.
- 400 no pré-efeito principal com unidade ausente para role contextual: error="Para usuários e diretores, é obrigatório selecionar uma unidade vinculada.", code="UNIT_REQUIRED" e nenhum efeito colateral.
- 400 no pré-efeito principal com e-mail global já existente sem cenário de vínculo permitido: error="Email já cadastrado", code="EMAIL_DUPLICATE" e nenhum efeito colateral.
- 400 no pré-efeito principal com funcionario_id inexistente: error="Funcionário não encontrado", code="FUNC_NOT_FOUND" e nenhum efeito colateral.
- 400 no pré-efeito principal com funcionário já vinculado: error="Funcionário já vinculado a um usuário", code="FUNC_ALREADY_LINKED" e nenhum efeito colateral.
- 400 no pré-efeito principal com unidade explícita divergente da unidade do funcionário: error="Funcionário pertence a outra unidade", code="FUNC_WRONG_UNIT" e nenhum efeito colateral.
- 400 no pré-efeito principal com funcionario_id inválido: error="Funcionário inválido", code="FUNC_INVALID" e nenhum efeito colateral.
- 201 created: cria usuário novo com membership contextual e retorna outcome="created".
- 201 linked: reaproveita o mesmo User e adiciona membership em outra unidade, retornando outcome="linked".
- 400 quando o usuário já está vinculado à mesma unidade: error="Usuário já vinculado a esta unidade", code="USER_MEMBERSHIP_DUPLICATE".

## Cobertura validada

- Arquivo de teste: tests/gestor-user-create-or-link.test.js.
- Cenários agora congelados na suíte focal:
  - POST /gestor/api/usuarios aplica gates mínimos de autenticação e autorização no caminho montado real.
  - POST /gestor/api/usuarios bloqueia seleção pendente no middleware antes do controller no caminho montado real.
  - POST /gestor/api/usuarios falha com EMAIL_REQUIRED antes de qualquer efeito no caminho montado real.
  - POST /gestor/api/usuarios falha com UNIT_REQUIRED no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios falha com EMAIL_DUPLICATE no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios falha com FUNC_NOT_FOUND no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios falha com FUNC_ALREADY_LINKED no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios falha com FUNC_WRONG_UNIT no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios falha com FUNC_INVALID no bloco pre-efeito principal do controller.
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