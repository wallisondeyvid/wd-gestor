# Arquitetura Modular

## Visão Geral
O projeto foi reorganizado para suportar múltiplos módulos de negócio independentes (ex: Gestor, Escalas), compartilhando infraestrutura comum (core) e utilidades (shared).

```
src/
  core/
    models/          # Modelos Mongoose centralizados
    (futuro: db/, logger/, security/)
  shared/
    utils/           # Funções utilitárias puras (ex: cnpj, máscaras, formatadores)
  gestor/            # Código legado modularizado (será migrado para modules/gestor totalmente em fase futura)
  escalas/           # Módulo Escalas (em construção)
  modules/
    gestor/          # Wrapper do módulo Gestor (adapter para nova convenção)
    escalas/         # Wrapper do módulo Escalas
  server.js          # Bootstrap unificado que monta sub-apps
```

## Componentes

### Core
Responsável por:
- Modelos de dados (`core/models`)
- (E futuro) inicialização de banco, logger, configurações cross-cutting.

### Shared
Utilidades independentes de domínio:
- Funções puras reutilizáveis
- Sem dependência de Express/Mongoose sempre que possível

### Modules
Cada módulo expõe uma função `buildModule()` que retorna um sub-app Express.
No momento:
- `modules/gestor` aponta para implementação existente em `src/gestor/gestor-app.js`
- `modules/escalas` wrap em `src/escalas/escalas-app.js`

### Alias de Imports
Definidos em `package.json`:
```json
"imports": {
  "#core/*": "./src/core/*",
  "#shared/*": "./src/shared/*",
  "#modules/*": "./src/modules/*",
  "#gestor/*": "./src/gestor/*"
}
```
Objetivo: eliminar caminhos relativos profundos e preparar refatorações futuras.

## Fluxo de Inicialização
1. `src/start.js` invoca `createServer()` para criar o app Express base.
2. Monta o módulo Gestor em `/`.
3. Monta o módulo Escalas em `/escalas`.
4. Sessão e estáticos configurados previamente ao mount.

## Estratégia de Migração (Fases Futuras)
1. Migrar utilidades de `src/gestor/utils` para `shared/utils` quando forem genéricas.
2. Criar `core/db/index.js` com conexão Mongo centralizada.
3. Extrair serviços de regra de negócio de controllers para `modules/<modulo>/services`.
4. Segregar controllers em `api/` e `views/` pastas internas.
5. Implementar testes por módulo (`tests/modules/gestor`, `tests/modules/escalas`).
6. Converter todo o código residual de `src/gestor` para dentro de `src/modules/gestor` e manter apenas adaptadores ou remover ponte.

## Convenções
- Controllers não devem importar de outros módulos diretamente; usar serviços/core.
- Caminhos de import sempre via aliases.
- Models novos entram em `core/models`. Se um model for estritamente específico de um módulo isolável, poderá futuramente residir em `modules/<modulo>/domain/models` e ser re-exportado.

## Testes
Neste momento, a suíte aponta para utilidades e controllers do Gestor. Próximos passos:
- Criar testes de smoke para `/escalas`.
- Introduzir cobertura de integração multi-módulo.

## Observações
- O módulo Escalas ainda é esqueleto. A estrutura já suporta isolamento.
- A mudança manteve 100% dos testes existentes verdes.

---
Última atualização: 2025-09-17.
