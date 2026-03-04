# WD Gestor — Contrato de Módulo

Um módulo do WD Gestor é uma unidade plugável montada pela camada de composição (`createServer`).

## Estrutura mínima

Todo módulo deve expor, em `src/modules/<nome>/index.js`:

- `meta`
- `buildModule`

## Requisitos obrigatórios

### `meta`

`meta` deve ser um objeto com:

- `name`: string não vazia
- `basePath`: string iniciando com `/`

### `buildModule`

`buildModule(context)` deve:

- ser função
- retornar um Express app, ou um objeto no formato `{ app }`
- não chamar `listen()`

## Restrições de side-effects

É proibido dentro de `src/modules/**`:

- chamar `listen()`
- conectar Mongo no import
- iniciar timers/background jobs automaticamente no import
- executar side-effects no import de `index.js`

## Ciclo de vida

Somente o core (`createServer`/`start.js`) decide sobre:

- conexão com banco
- start/stop de timers
- boot/shutdown do processo
