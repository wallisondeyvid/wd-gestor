## criarUsuario -> createUsuarioExecutionService

Status: checkpointado
Classificacao: costura estrutural focal

## Objetivo encerrado

- Validar apenas a nova costura controller -> service em criarUsuario.
- Confirmar que o controller delega o nucleo de execucao pos-preflight ao owner service.
- Confirmar que o owner service preserva os ramos semanticos relevantes da execucao e que o controller preserva o mapeamento estrutural final para created e serverError.

## Escopo validado

- Arquivo de teste: tests/gestor-criar-usuario-execution-structural-seam.test.js.
- Comportamentos validados:
  - criarUsuario delega para createUsuarioExecutionService com entrada ja pre-validada e normalizada.
  - criarUsuario preserva o mapeamento estrutural final do caminho created.
  - criarUsuario preserva o mapeamento estrutural final do caminho serverError quando o owner devolve erro semantico de execucao.
  - createUsuarioExecutionService preserva criacao de usuario novo com sincronizacao de funcionario resolvido e membership contextual.
  - createUsuarioExecutionService preserva reaproveitamento de User existente com vinculacao a funcionario encontrado no ramo opcional.
  - createUsuarioExecutionService preserva o ramo semantico membership_duplicate.
  - createUsuarioExecutionService preserva o ramo semantico funcionario_create_error.

## Fora de escopo

- Nao revalida o contrato HTTP completo de POST /gestor/api/usuarios.
- Nao reabre rota, middleware, autenticacao ou autorizacao.
- Nao toca em outros handlers do corredor de Usuarios.

## Conclusao

- A nova costura interna de criarUsuario passou a ter prova estrutural focal minima.
- O recorte atinge ponto de congelamento intermediario ao somar a prova estrutural da delegacao e dos ramos semanticos do owner service ao contrato funcional ja congelado do endpoint.