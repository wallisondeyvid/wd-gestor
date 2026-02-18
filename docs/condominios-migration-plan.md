# Condomínios Migration Plan

- entry atual: src/modules/condominios/index.js (defineModule + buildModule), montado via src/server/createServer.js (registry/baseRegistry)
- pontos de acoplamento:
  - Reuso de APIs/controladores do Gestor (userApi, exclusão de usuário)
  - Dependências do Portal do Morador (portalAuth, portalSessionCookie, pushNotifications)
  - Modelos compartilhados em #core/models (unidade, user, funcionário, cond_*)
  - Hooks de ciclo de vida no createServer (meta.onStart/meta.onStop) e alias /condominio
- risco estimado: médio
- plano (4 passos):
  1. Inventariar mounts e aliases atuais em createServer (incluindo /condominio) e congelar contrato HTTP.
  2. Encapsular montagem em wrapper estrutural compatível com moduleContract sem alterar rotas internas.
  3. Validar dependências cruzadas (Gestor/Portal/Core models) com smoke tests e testes de contrato.
  4. Remover mount residual somente se houver duplicidade comprovada, mantendo compatibilidade externa.
