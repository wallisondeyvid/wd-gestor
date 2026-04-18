# Checkpoint: Gestor Tenant Enforcement Usuarios Administrativos Decima Quinta Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 4ddcfd2
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece usuarios administrativos

## Familia consolidada

- tenant enforcement da familia Pages e owners de usuarios administrativos do Gestor

## Foco explicito

- endurecimento do corredor de /gestor/usuarios para eliminar leitura global sem escopo no caminho contextual
- separacao explicita entre branch global de master e admin e branch contextual ancorado no contexto canonico efetivo

## Fronteira do recorte

- src/modules/gestor/app/controllers/views/pagesController.js
- src/modules/gestor/app/services/usuarios/listUsuariosOwner.service.js
- tests/gestor-users-memberships-page.test.js

## Invariantes atendidos

- /gestor/usuarios deixou de depender de leitura global sem escopo no caminho contextual
- listUsuariosOwner.service.js passou a distinguir explicitamente branch global e branch contextual
- o branch contextual nasce de req.unitScope e filtra usuarios, unidades e funcionarios dentro do escopo permitido
- nao foi introduzido fallback concorrente por req.user.unidade_id, req.session.user.unidade_id, active_unidade_id ou equivalente
- master e admin continuam globais de forma explicita
- pagesRouter.js permaneceu sem diff material
- usuario.js permaneceu sem diff material

## Testes focais que validaram o recorte

- tests/gestor-users-memberships-page.test.js
- tests/gestor-usuarios-bloqueados-runtime-contract.test.js
- tests/gestor-usuarios-bloqueados-structural-seam-runtime-contract.test.js
- tests/gestor-usuarios-admin-runtime-contract.test.js

## Motivo de parada

- consolidacao isolada da decima quinta fatia macro de tenant enforcement, sem tocar em producao fora do corredor de usuarios administrativos, sem alterar rotas correlatas, migration-status ou outros corredores documentais