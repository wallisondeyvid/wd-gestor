# Migração de Rotas de Autenticação (/login -> /gestor/login)

Este documento descreve a estratégia de transição das rotas de autenticação raiz para rotas prefixadas por módulo.

## Objetivo
Padronizar acesso multi-módulo permitindo URLs consistentes: `/gestor/login`, `/escalas/login`, `/vendas/login`, etc., reduzindo colisões e facilitando isolamento lógico.

## Fases
| Fase | Descrição | Flags | Estado |
|------|-----------|-------|--------|
| 1 | Convivência: rotas raiz e prefixadas ativas | (nenhuma) | Concluída |
| 2 | Preferência por prefixo: rotas raiz redirecionam (308/302) para prefixadas | `PREFER_GESTOR_PREFIX=true` | Concluída (substituída) |
| 3 | Desativação raiz: rotas raiz removidas/retornam 404/redirect permanente | `DISABLE_ROOT_AUTH_ROUTES=true` | Concluída (rota /login removida manualmente) |
| 4 | Limpeza: código legado e métricas removidos após adoção total | (após verificação de métricas) | Em andamento |
| 5 | Remoção de flags e simplificação | (nenhuma) | Pendente |

## Flags de Ambiente
- `PREFER_GESTOR_PREFIX=true`:
  - POST `/login` -> 308 `/gestor/login`
  - GET `/reset-password/:token` -> 302 `/gestor/reset-password/:token`
  - POST `/reset-password` -> 308 `/gestor/reset-password`
  - POST `/esqueci-senha` e `/esquecisenha` -> 308 `/gestor/...`
  - GET `/api/recover/emails` -> 302 `/gestor/api/recover/emails`
- `DISABLE_ROOT_AUTH_ROUTES=true`:
  - Todas as rotas raiz de auth deixam de ser registradas (não há redirect; segurança máxima / limpeza).

As flags são mutuamente cumulativas: se ambas setadas, `DISABLE_ROOT_AUTH_ROUTES` prevalece (rotas raiz não existem, logo `PREFER_GESTOR_PREFIX` não tem efeito prático).

## Métricas
`req.app.locals.routeUsage` mantém contadores:
```json
{
  "auth": { "root": 123, "prefixed": 456 },
  "pages": { "root": 200, "prefixed": 380 }
}
```
Use endpoint de inspeção existente (ex.: adicionar rota admin temporária) ou REPL para monitorar adoção antes de mudar de fase.

## Recomendações de Rollout
1. (Já) Deploy com fase 1 e iniciar logging.
2. Monitorar logs por 1-2 semanas; atualizar clientes/front para usar somente `/gestor/*`.
3. Ativar `PREFER_GESTOR_PREFIX=true` em staging; validar redirects; depois produção.
4. Após >95% adoção (prefixed > root por 7 dias), ativar `DISABLE_ROOT_AUTH_ROUTES=true`.
5. Passadas 2 semanas sem acessos raiz (root=0 diário), remover código de métricas e referências.

## Próximos Módulos
Para novos módulos (ex.: Vendas):
1. Criar sub-app `modules/vendas`.
2. Reutilizar templates com `moduleLabel` e `basePath:'/vendas'`.
3. Replicar padrão de auth/lockout/remember.
4. (Opcional) Adicionar flag `ENABLE_VENDAS` para feature toggle inicial.

## Limpeza Futuras (Checklist)
- Remover redirects temporários.
- Remover contagem de métricas.
- Atualizar documentação externa / onboarding.
- Verificar bookmarks / links hardcoded em e-mails.

## Segurança
- Redirects usam 308 (POST) para preservar método quando apropriado.
- Rotas raiz podem ser totalmente desativadas, reduzindo superfície de ataque.
- `reset-password` tokens permanecem válidos; apenas o path muda em links futuros.

## Observações
- Emails antigos com link para `/login` agora devem ser ajustados manualmente para `/gestor/login` (rota raiz removida).
- Links de redefinição de senha antigos continuam válidos (rota `/reset-password/:token` preservada até migração futura específica).
- Sempre validar métricas antes de avançar entre as fases 4 -> 5.

---
Documento gerado automaticamente como parte da padronização de rotas de autenticação.
