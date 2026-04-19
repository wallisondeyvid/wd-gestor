## obterUsuarioAtual -> getUsuarioAtualProfileOwnerService

Status: checkpointado
Classificacao: costura estrutural focal

## Objetivo encerrado

- Validar apenas a nova costura controller -> service em obterUsuarioAtual.
- Confirmar que o controller delega a resolucao do perfil base ao owner service sem absorver o enriquecimento final por auth-context.
- Confirmar que o owner service trata `sessionUserId` como fonte autoritativa do perfil atual e deixa o fallback id -> e-mail apenas para chamadas sem id autoritativo, além do ramo not_found e do payload base atual.

## Escopo validado

- Arquivo de teste: tests/gestor-usuario-atual-profile-owner-structural-seam.test.js.
- Comportamentos validados:
  - obterUsuarioAtual delega para getUsuarioAtualProfileOwnerService com unitScope, sessionUserId e fallbackEmail derivados do request.
  - obterUsuarioAtual continua dono do enriquecimento final por auth-context e do shape estrutural da resposta de sucesso.
  - getUsuarioAtualProfileOwnerService trata `sessionUserId` como winner runtime interno do perfil atual.
  - getUsuarioAtualProfileOwnerService preserva o fallback id -> e-mail apenas como branch interna de compatibilidade controlada para chamadas sem id autoritativo.
  - getUsuarioAtualProfileOwnerService preserva o ramo semantico not_found.
  - getUsuarioAtualProfileOwnerService preserva a montagem do payload base atual.

## Fora de escopo

- Nao revalida contrato HTTP completo do endpoint montado.
- Nao altera auth-context resolver.
- Nao altera buildUsuarioAuthContextExtras.
- Nao toca em outros handlers do corredor de Usuarios.

## Conclusao

- A nova costura interna de obterUsuarioAtual passou a ter prova estrutural focal minima.
- O recorte atinge ponto de congelamento intermediario, mantendo a cobertura funcional existente para o contrato vivo e acrescentando a prova interna da delegacao e dos ramos semanticos do owner service.
- O fallback id -> e-mail fica caracterizado neste checkpoint como compatibilidade controlada interna, e não como winner runtime público do endpoint montado.
- O winner runtime interno do owner passa a nascer de `sessionUserId` + `unitScope` quando o endpoint é chamado no caminho montado real.