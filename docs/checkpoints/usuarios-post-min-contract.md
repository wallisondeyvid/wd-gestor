## POST /gestor/api/usuarios

Status: checkpointado
Classificacao: MICRO_PASSO_SEGURO consumido

## Objetivo encerrado

- Consolidar documentalmente o contrato mínimo real de POST /gestor/api/usuarios no caminho montado atual do app.
- Consolidar no mesmo checkpoint os congelamentos adicionais de Fase 2 já validados pela suíte focal, sem patch de produção e sem abrir fluxos mais amplos de criação de usuário, membership, funcionário, mailer ou bridge.

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
- 201 created com funcionario_id válido e role contextual: mantém coerência final entre User.funcionario_id, Funcionario.usuario_id e UserMembership.funcionario_id, com status="active" e origem="gestor-user-admin" no membership criado.
- 201 linked com funcionario_id válido em nova unidade contextual: reaproveita o mesmo User, cria exatamente um novo UserMembership na nova unidade, preenche UserMembership.funcionario_id, aponta Funcionario.usuario_id para o User reutilizado e preserva User.funcionario_id coerente no estado final.
- Role vazia e role="master" são normalizadas para role efetiva "user" no fluxo created.
- Quando a role não gera papel_contextual, o endpoint ainda pode responder 201 created sem criar UserMembership; com funcionario_id válido, o vínculo User.funcionario_id e Funcionario.usuario_id é efetivado mesmo sem membership contextual.
- ExistingUser + role="admin" + unidade_id presente + funcionario_id válido e existente, sem possibilidade de membership contextual, aborta com 400 EMAIL_DUPLICATE antes do bloco de vínculo por funcionário: sem data.outcome, sem segundo User, sem UserMembership, User existente permanece sem funcionario_id e Funcionario permanece sem usuario_id.
- 400 quando o usuário já está vinculado à mesma unidade: error="Usuário já vinculado a esta unidade", code="USER_MEMBERSHIP_DUPLICATE".

## Cobertura validada

- Arquivo de teste: tests/gestor-user-create-or-link.test.js.
- Cenários agora congelados na suíte focal:
  - POST /gestor/api/usuarios aplica gates mínimos de autenticação e autorização no caminho montado real.
  - POST /gestor/api/usuarios bloqueia seleção pendente no middleware antes do controller no caminho montado real.
  - POST /gestor/api/usuarios falha com EMAIL_REQUIRED antes de qualquer efeito no caminho montado real.
  - POST /gestor/api/usuarios falha com UNIT_REQUIRED no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios falha com EMAIL_DUPLICATE no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios mantém EMAIL_DUPLICATE para User existente com role admin, unidade_id presente e funcionario_id válido sem membership contextual.
  - POST /gestor/api/usuarios falha com FUNC_NOT_FOUND no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios falha com FUNC_ALREADY_LINKED no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios falha com FUNC_WRONG_UNIT no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios falha com FUNC_INVALID no bloco pre-efeito principal do controller.
  - POST /gestor/api/usuarios cria usuário novo com membership contextual.
  - POST /gestor/api/usuarios normaliza role vazia e master para user no fluxo created.
  - POST /gestor/api/usuarios cria User com funcionario_id válido e sem membership contextual quando a role não mapeia para papel_contextual.
  - POST /gestor/api/usuarios cria usuário novo com funcionario_id válido e membership contextual coerente.
  - POST /gestor/api/usuarios reaproveita o mesmo User e adiciona membership em outra unidade.
  - POST /gestor/api/usuarios reaproveita User existente com funcionario_id valido em nova unidade contextual mantendo coerencia interna.
  - POST /gestor/api/usuarios falha claramente quando o usuário já está vinculado à mesma unidade.
- Execução focal validada: node --test tests/gestor-user-create-or-link.test.js.
- A origem do 401 permanece em requireLogin.
- A origem do 403 permanece no guard interno do controller.

## Conclusão

- POST /gestor/api/usuarios tem contrato mínimo real e os microcortes documentados de Fase 2 suficientemente congelados no caminho montado real do app.
- O checkpoint agora registra tanto os gates mínimos quanto os comportamentos contextuais já validados para created, linked, coerência User/Funcionario/UserMembership, normalização de role e abortos sem membership contextual.
- Não houve alteração em produção.
- O restante do endpoint sobe para EXIGE_AUDITORIA_MAIOR.