# Gestor Usuarios Unlock Structural Seam Runtime Contract

Status: checkpointado
Classificacao: costura estrutural focal

## Objetivo encerrado

- Validar apenas a nova costura controller -> service em unlockUsuario.
- Confirmar que o controller delega o nucleo minimo de desbloqueio ao owner service.
- Confirmar que o owner service preserva exatamente a mutacao minima de unlock.
- Confirmar que o controller preserva o shape estrutural do JSON final.

## Escopo validado

- Arquivo de teste: tests/gestor-usuarios-unlock-structural-seam.test.js.
- Comportamentos validados:
  - unlockUsuario delega para unlockUsuarioExecutionService com o User ja carregado.
  - unlockUsuario preserva o shape estrutural final do JSON de sucesso com success, unlocked e id.
  - unlockUsuarioExecutionService reseta failed_login_attempts para 0.
  - unlockUsuarioExecutionService limpa lock_until para null.
  - unlockUsuarioExecutionService persiste o User e devolve resultado semantico simples de unlock.

## Fora de escopo

- Nao revalida o contrato HTTP completo do endpoint.
- Nao reabre rota, middleware, autenticacao ou autorizacao.
- Nao toca em atualizarSenhaUsuario nem em outros handlers do corredor de Usuarios.

## Conclusao

- A nova costura interna de unlockUsuario passou a ter prova estrutural focal minima.
- O recorte atinge ponto de congelamento intermediario ao somar a prova estrutural da delegacao e da mutacao minima do owner service ao contrato runtime externo ja congelado.