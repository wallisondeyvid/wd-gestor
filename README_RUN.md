# Execução rápida (Gestor Backend)

Este guia explica como rodar o servidor com MongoDB em memória (para desenvolvimento) ou no MongoDB Atlas (persistência), e como habilitar sessão persistente.

## Requisitos
- Node.js 18+
- Variáveis de ambiente em um arquivo `.env` na raiz (opcional)

## Variáveis de ambiente
- `MONGO_URI` ou `MONGODB_URI`: string de conexão do MongoDB (ex.: Atlas). Se ausente, use `MONGO_MEMORY=1` para subir Mongo em memória.
- `MONGO_MEMORY=1`: habilita banco em memória (apenas desenvolvimento).
- `SESSION_SECRET`: segredo para assinar cookies de sessão (defina em produção!).
- `SESSION_STORE=mongo`: usa `connect-mongo` para persistir sessões na mesma base do `MONGO_URI`/`MONGODB_URI`.
- `PORT`: porta do servidor (padrão: 3001).
- `NODE_ENV`: `development` ou `production`.

## Modos de execução

- Desenvolvimento com banco em memória:
  - Windows (cmd):
    - `set MONGO_MEMORY=1 && set SESSION_SECRET=dev && npm start`
  - Ou use o atalho: `npm run start:mem`

- Com Atlas (persistente):
  - Configure `.env`:
    - `MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority`
    - `SESSION_SECRET=troque-este-segredo`
    - Opcional: `SESSION_STORE=mongo` para persistir sessões
  - Rode: `npm run start:atlas`

## Sessões HTTP
- Por padrão usa `MemoryStore` (não persistente, adequado apenas para dev).
- Se `SESSION_STORE=mongo`, o servidor usa `connect-mongo` com a URL de `MONGO_URI/MONGODB_URI`.
- Cookie: `wdg.sid` (8 horas, `secure` em produção, `SameSite=Lax`).

## Problemas comuns
- Erro: "Sem URI do Mongo e sem MONGO_MEMORY": defina `MONGO_URI/MONGODB_URI` ou `MONGO_MEMORY=1`.
- Sessões não persistem após restart: habilite `SESSION_STORE=mongo` e garanta `MONGO_URI/MONGODB_URI` válido.

## Inicialização no Windows
- `iniciar-servidor.bat` executa `node src/start.js` usando as variáveis do ambiente atual.

## Endpoints úteis
- `/health` retorna status 200 quando o servidor está pronto.
