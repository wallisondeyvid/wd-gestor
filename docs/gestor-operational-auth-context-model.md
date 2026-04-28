# Modelo Operacional do Gestor para Auth-context e Domínios Híbridos

## Contexto

- WD Gestor significa a aplicação inteira, mas este documento foca apenas no módulo Gestor.
- A Fase A gerou a matriz inicial de domínios em `docs/multi-tenant-domain-matrix.md`.
- A Fase B foi planejada em `docs/tenant-phase-b-auth-context-plan.md` como uma fase semântica e operacional, não como patch imediato.
- O estado atual do Gestor continua sendo híbrido controlado: a infraestrutura tenant-aware já existe, mas a semântica de identidade global, vínculo por unidade, operação contextual e uso legítimo de escopo global ainda precisa ser consolidada em regras operacionais explícitas.
- Este documento traduz o planejamento da Fase B em regras práticas para o Gestor, sem alterar código, sem alterar testes e sem preparar PostgreSQL.

## Objetivo

Estabelecer um modelo operacional explícito para o Gestor que separe claramente:

1. identidade global;
2. vínculo por unidade;
3. operação contextual;
4. globais legítimos versus compat legado.

O objetivo não é descrever implementação detalhada, mas fixar a semântica correta que as próximas fases deverão preservar.

## Princípios operacionais

- identidade global não depende de unidade ativa;
- vínculo operacional por unidade nasce de `user_memberships`;
- operação tenant-sensitive depende de contexto canônico e de `req.unitScope` quando a requisição entra em superfície contextual;
- `req.session.user` é projeção de compatibilidade, não fonte primária de autorização;
- `GLOBAL_SCOPE` só é aceitável em ramos globais legítimos explicitamente listados;
- `active_unidade_id` representa contexto escolhido, não autorização por si só;
- `master` e `admin` sem unidade ativa só podem operar com visão global explícita nos fluxos documentados;
- usuário comum sem unidade ativa deve ser bloqueado em operação contextual.

## Tabela 1 — Identidade global

| Dado ou atributo | Fonte correta | Pode depender de unidade? | Pode usar `req.session.user`? | Pode usar `GLOBAL_SCOPE`? | Regra operacional |
| --- | --- | --- | --- | --- | --- |
| usuário | coleção global de usuários | não | apenas como projeção | sim, quando for identidade global | usuário é identidade global do Gestor, não contexto operacional |
| email | `User.email` | não | apenas como espelho | sim | email é identificador global de autenticação |
| senha ou hash | credencial global do usuário | não | não | sim | autenticação básica não depende de unidade ativa |
| reset token | fluxo global de recuperação | não | não | sim | reset continua global enquanto ligado à identidade global |
| remember token | token global de sessão persistente | não | não | sim | remember token não deve carregar autorização contextual própria |
| lockout ou status de login | estado global de autenticação | não | apenas para projeção de estado | sim | lockout é atributo global do usuário |
| `global_role` | campo global do usuário | não | apenas para projeção derivada | sim | `global_role` define privilégio global legítimo |
| permissões globais master ou admin | `global_role` e regras documentadas | não | apenas como projeção derivada | sim | master e admin são globais legítimos e não exigem unidade ativa para existir |

## Tabela 2 — Vínculo por unidade

| Dado ou relação | Fonte correta | Depende de `user_memberships`? | Depende de `active_unidade_id`? | Depende de `req.unitScope`? | Regra operacional |
| --- | --- | --- | --- | --- | --- |
| `user_memberships` | coleção de vínculos contextuais | sim | não diretamente | não diretamente | é a fonte de verdade do vínculo por unidade |
| `user_id` no vínculo | relação com identidade global | sim | não | não | conecta o usuário global ao vínculo contextual |
| `unidade_id` no vínculo | próprio membership | sim | sim quando o vínculo estiver ativo | indiretamente | define a unidade do vínculo operacional |
| role contextual | `papel_contextual` do membership | sim | sim quando houver contexto ativo | indiretamente | papel contextual não nasce de `req.session.user.role` legado |
| funcionário vinculado | `funcionario_id` do membership | sim quando existir | sim | indiretamente | funcionário contextual deve ser coerente com a unidade ativa |
| unidade ativa | `active_unidade_id` no auth-context | sim, após seleção ou login com vínculo único | sim | sim nas rotas contextuais | unidade ativa é contexto selecionado, não fallback inventado |
| seleção pendente | `needs_selection=true` no auth-context | sim, quando houver múltiplos vínculos | não | não | seleção pendente bloqueia operações contextuais |
| troca de unidade | fluxo `switch-unit` ou equivalente | sim | sim | sim após resolução | troca de unidade muda o contexto operacional, não a identidade global |

## Tabela 3 — Operação contextual

| Domínio ou ação | Escopo esperado | Fonte obrigatória de contexto | Fallback permitido? | Regra operacional |
| --- | --- | --- | --- | --- |
| funcionários create, edit e delete | contextual por unidade | `req.unitScope` canônico | não | sem unidade ativa canônica, a operação deve ser bloqueada |
| funcionários detalhe, foto e anexo | contextual por unidade | `req.unitScope` e autorização contextual | não | detalhe e anexos permanecem indisponíveis sem contexto ativo |
| funcionários listagem contextual | contextual por unidade | `req.unitScope` | não para usuário comum | listagem contextual segue a unidade ativa |
| funcionários consulta global | global explícito privilegiado | `global_role` e fluxo documentado | sim, apenas para master ou admin sem unidade ativa nos fluxos documentados | visão global é de consulta apenas e sem ações contextuais |
| funções | contextual por unidade | `req.unitScope` e política contextual | não, salvo ramo privilegiado explicitamente aceito | criação, edição e listagem contextual não devem nascer de sessão legado |
| setores | contextual por unidade | `req.unitScope` e contexto canônico | não para operação tenant-sensitive | setor continua sensível à unidade ativa |
| recursos | contextual por unidade | `req.unitScope` ou `scopedUnitId` canônico | não | recursos não devem aceitar unidade inferida por fallback legado |
| feedback | híbrido com dominante contextual | `req.unitScope` no widget canônico e escopo por auth-context no ramo administrativo | apenas compatibilidade legacy explicitamente documentada | nenhum write de feedback deve ampliar escopo fora da unidade contextual válida |
| unidades cluster | híbrido controlado | contexto efetivo ou ramo global privilegiado documentado | sim, apenas para globais legítimos | cluster contextual depende do contexto ativo; master e admin podem alcançar ramo global já legitimado |
| páginas contextuais do Gestor | contextual por unidade | `req.unitScope`, auth-context resolvido e cluster permitido | não para usuário comum sem unidade ativa | páginas contextuais devem operar em modo context-first |

## Tabela 4 — Globais legítimos versus compat legado

| Caso | Tipo | Justificativa | Pode permanecer? | Destino futuro |
| --- | --- | --- | --- | --- |
| módulos | global legítimo | catálogo global do produto | sim | permanecer como catálogo global explícito |
| catálogos administrativos | global legítimo | não representam por si só operação contextual | sim, quando documentados | permanecer como globais legítimos listados |
| visão global master ou admin | global legítimo | privilégio global explícito já consolidado em fluxos específicos | sim, com escopo documentado | manter apenas onde a regra funcional já estiver fechada |
| provisioning | global legítimo | snapshot e trilha global do tenant base por unidade | sim | permanecer global como orquestração e auditoria |
| `GLOBAL_SCOPE` em `api.db.js` | compat legado | mistura catálogo global e resíduos de conveniência | não como estado final amplo | segmentar semanticamente por domínio |
| `GLOBAL_SCOPE` em `auth.db.js` | compat legado | auth legado ainda centraliza superfícies híbridas | não como estado final amplo | restringir a identidade global e ramos legítimos |
| `req.session.user.unidade_id` | compat legado | projeção histórica de contexto | só temporariamente | ficar apenas como projeção derivada |
| `req.user.unidade_id` | compat legado | ainda aparece como projeção ou fallback residual em alguns corredores | só temporariamente | deixar de ser fonte material concorrente |
| seleção pendente | compat legado temporário aceitável | estado canônico de usuário autenticado sem contexto ativo escolhido | sim, enquanto houver múltiplos vínculos e rollout parcial | permanecer como estado explícito do auth-context |

## Regras de precedência

1. Identidade global não deve depender de unidade ativa.
2. Vínculo operacional por unidade deve vir de `user_memberships`.
3. Operação contextual tenant-sensitive deve usar `req.unitScope`.
4. `req.session.user` é projeção de compatibilidade, não fonte de autorização.
5. `GLOBAL_SCOPE` só é válido para globais legítimos explicitamente listados.
6. `active_unidade_id` indica contexto operacional escolhido, não autorização por si só.
7. `master` e `admin` sem unidade ativa podem ter visão global explícita apenas nos fluxos documentados.
8. Usuário comum sem unidade ativa deve ser bloqueado em operação contextual.

## Fallbacks permitidos

- visão global explícita de `master` e `admin` nos fluxos já documentados como legítimos;
- catálogos administrativos globais que não representam operação contextual;
- seleção pendente como estado válido do auth-context;
- `req.session.user` apenas como projeção derivada enquanto o legado ainda depender dela;
- `GLOBAL_SCOPE` apenas nos ramos já classificados como globais legítimos;
- compatibilidade transitória com flags desligadas nas superfícies ainda não migradas por completo.

## Fallbacks proibidos

- `req.user.unidade_id` como fonte material concorrente de contexto operacional;
- `req.session.user.unidade_id` como autorização real para operações tenant-sensitive;
- ausência de `req.unitScope` tratada automaticamente como global legítimo em domínio contextual;
- write contextual sem unidade canônica resolvida;
- uso difuso de `GLOBAL_SCOPE` para resolver ambiguidade de superfície híbrida;
- criação artificial de contexto ativo para evitar bloqueio de seleção pendente.

## Critérios de pronto

- documento criado;
- quatro tabelas centrais preenchidas;
- regras de precedência explícitas;
- fallbacks permitidos e proibidos listados;
- nenhum código alterado;
- nenhum teste alterado.

## Escopo deste artefato

- documento estritamente operacional e documental;
- sem alteração funcional;
- sem alteração de testes;
- sem ativação de flags;
- sem preparação para PostgreSQL.