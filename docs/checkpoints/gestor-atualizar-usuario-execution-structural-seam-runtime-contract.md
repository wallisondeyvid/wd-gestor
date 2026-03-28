## atualizarUsuario -> updateUsuarioExecutionService

Status: checkpointado
Classificacao: costura estrutural focal

## Objetivo encerrado

- Validar apenas a nova costura controller -> service em atualizarUsuario.
- Confirmar que o controller delega o nucleo de mutacao pos-preflight ao owner service.
- Confirmar que o owner service preserva a ordem semantica entre desvincular, vincular e salvar.
- Confirmar que o controller preserva o mapeamento estrutural final para JSON ou redirect.

## Escopo validado

- Arquivo de teste: tests/gestor-atualizar-usuario-execution-structural-seam.test.js.
- Comportamentos validados:
  - atualizarUsuario delega para updateUsuarioExecutionService com o User ja carregado e a entrada ja validada e normalizada.
  - atualizarUsuario preserva o mapeamento estrutural final do caminho JSON.
  - atualizarUsuario preserva o mapeamento estrutural final do caminho redirect.
  - updateUsuarioExecutionService preserva a ordem semantica entre unset do vinculo anterior, set do novo vinculo e save final do User.

## Fora de escopo

- Nao revalida o contrato HTTP completo do endpoint.
- Nao reabre rota, middleware, autenticacao ou autorizacao.
- Nao toca em outros handlers do corredor de Usuarios.

## Conclusao

- A nova costura interna de atualizarUsuario passou a ter prova estrutural focal minima.
- O recorte atinge ponto de congelamento intermediario ao somar a prova estrutural da delegacao e da ordem semantica do owner service ao comportamento externo ja preservado pelo controller.