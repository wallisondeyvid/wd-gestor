# Remoção de Arquivos Legacy (Monólito Gestor)

Data: 2025-09-17

## O que foi removido / neutralizado

Foram removidos (ou substituídos por stubs antes da remoção física) os seguintes arquivos legacy do antigo monólito:

Remoções concluídas:
- `src/gestor-app.js` [removido]
- `src/gestor-app.js.backup` [removido]
- `src/index.js` [removido]
- `src/migrar-indices-empresas.js` [removido]
- `src/migrar-indices-corrigidos.js` [removido; substituído por `scripts/migrations/2025-09-17_migrar-indices-corrigidos.js`]

## Motivo

1. Código monolítico difícil de manter.
2. Riscos de regressões se alguém editar arquivos antigos.
3. Arquivos de migração corrompidos ou redundantes.
4. Duplicidade com a nova arquitetura modular em `src/gestor/`.

## Arquitetura Atual

- Entrada principal modular: `src/gestor/gestor-app.js`
- Bootstrap / inicialização: `src/gestor/bootstrap/`
- Controllers separados por domínio em `src/gestor/controllers/`
- Rotas organizadas em `src/gestor/routes/`
- Scripts de migração versionados e datados em `scripts/migrations/`

## Política de Migração de Scripts

- Todo novo script de migração deve ser criado em `scripts/migrations/` com prefixo de data: `YYYY-MM-DD_descricao.js`.
- Scripts são idempotentes sempre que possível.
- Após execução bem-sucedida, registrar no log de deploy ou CHANGELOG (futuro).

## Como detectar reaparecimento de arquivos antigos

Há um script utilitário (será adicionado) que valida a ausência dos arquivos legacy. Execute:

```bash
npm run verify:legacy
```

## Próximos Passos Sugeridos

- Adicionar lint consistente para impedir imports fora dos módulos permitidos.
- Criar teste de smoke que sobe apenas o módulo Gestor e checa rotas básicas.
- Implementar CHANGELOG para acompanhar migrações.

## Contato

Responsável técnico atual: (preencher)

---
Se algum merge reintroduzir os arquivos antigos, rode `npm run verify:legacy` imediatamente e elimine-os novamente.
