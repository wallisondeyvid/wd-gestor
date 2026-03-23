# Gestor - contrato runtime de desbloqueio de usuário

Status: checkpointado
Classificacao: PONTO_DE_CONGELAMENTO_LOCAL

## Objetivo encerrado

- Registrar formalmente o contrato runtime real congelado por suíte dedicada para o endpoint de desbloqueio de usuário no Gestor.
- Fixar o owner efetivo atual, o envelope observável e o efeito de negócio validado em runtime.

## Rota auditada

- POST /gestor/api/usuarios/:id/unlock

## Owner runtime atual

- Owner runtime efetivo atual: router legado.
- Rota montada no corredor legado de usuários do Gestor em src/modules/gestor/app/routes/usuario.js.
- O wiring do app mantém usuarioRouter montado antes dos routers de API compartilhados em src/modules/gestor/app/gestor-app.js.
- Controller que atende a rota: unlockUsuario em src/modules/gestor/app/controllers/userController.js.

## Contrato observável congelado

### POST /gestor/api/usuarios/:id/unlock

- Sem sessão: 401 JSON com success=false, error='Não autenticado' e code='UNAUTHORIZED'.
- Autenticado sem privilégio suficiente: 403 JSON com success=false, error='Acesso negado' e code='FORBIDDEN'.
- Id bem formado sem usuário correspondente: 404 JSON com success=false, error='Usuário não encontrado' e code='NOT_FOUND'.
- Sucesso: 200 JSON com success=true, unlocked=true e id.
- Erro interno: 500 JSON com success=false, error='Falha ao desbloquear usuário' e code='SERVER_ERROR'.

## Efeito de negócio congelado

- Em caso de sucesso, o handler limpa failed_login_attempts para 0.
- Em caso de sucesso, o handler zera lock_until para null.

## Observações de runtime relevantes

- O endpoint é JSON only em todos os cenários congelados.
- Para representar fielmente o runtime autenticado sem privilégio, a suíte usou um diretor autenticável, que entra no Gestor mas continua sem permissão para o unlock.
- Não houve divergência adicional entre contrato teórico lido e runtime observado na execução focal; a suíte fechou verde na primeira rodada.

## Evidência executável

- Suíte dedicada: tests/gestor-usuarios-unlock-runtime-contract.test.js
- Execução focal validada: node --test .\tests\gestor-usuarios-unlock-runtime-contract.test.js
- Resultado validado: 6 testes, 6 passes, 0 falhas

## Classificação

- Este arquivo registra um ponto de congelamento local para este endpoint específico.
- Nenhum microrefactor interno foi aplicado nesta rodada; o melhor patch foi nenhum.
- Mudanças futuras neste caminho devem preservar primeiro o contrato público aqui descrito ou vir acompanhadas de nova decisão deliberada.