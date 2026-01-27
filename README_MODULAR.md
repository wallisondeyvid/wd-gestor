# Arquitetura Modular do WDGestor

## Visão Geral
A aplicação foi reorganizada para um modelo modular, separando responsabilidades em camadas bem definidas.

Estrutura principal:
- `src/core/`  : Infraestrutura compartilhada (db, middlewares, utils, logger, mail, rate limit, models base, config, errors)
- `src/modules/`: Módulos de domínio (ex: `gestor`) contendo controllers, rotas, serviços, middlewares específicos
- `src/shared/` : Lógica cross-module (ex: sincronização funcionário/usuário)
- `models/`     : Proxies de models apontando para `src/core/models` (alias `#models/*`)
- `public/`     : Assets estáticos
- `views/`      : Templates EJS (ex: `views/gestor`)

## Convenções
- Imports core: `#core/...`
- Imports shared: `#shared/...`
- Imports modules: `#modules/...`
- Imports models: `#models/...` (sempre usar alias – evita acoplamento ao path interno do core)
- Respostas API padronizadas via `#core/utils/apiResponse.js`
- Rate limiting central em `#core/middlewares/rateLimit.js`

## Módulos
Cada módulo exporta:
```js
export default {
  name: 'gestor',
  mount(app) { /* registra rotas */ },
  async init() { /* seeds opcionais */ }
}
```

## Seeds
Seeds são chamados em `start.js` através de `module.init()` desde que variáveis de ambiente habilitem (`GESTOR_SEEDS=1` ou `SEEDS=1`).

## Testes
- Testes unitários e de rotas utilizam Node Test Runner (`node --test`).
- Smoke test placeholder será substituído por integração real futura.

## Próximos Passos Possíveis
- Introduzir camada de service unificada no core para operações comuns (ex: paginação, soft delete opcional).
- Implementar testes de integração do módulo Gestor com Mongo em memória.
- Evoluir logger para pino/winston com níveis e saída estruturada.

## Decisões Tomadas
- Remoção completa do diretório legado `src/gestor` para evitar deriva arquitetural.
- Centralização de `apiResponse` e `rateLimit` para reduzir duplicação.
- Criação de proxies de models para permitir futura reestruturação sem refatorar todos os imports.

## Contato
Dúvidas ou melhorias: abrir issue interna ou continuar iterações guiadas.
