# Checkpoint: GET /gestor/api/funcionarios/:id/foto

## Escopo
- Endpoint congelado: `GET /gestor/api/funcionarios/:id/foto`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`getFuncionarioFoto`)
- Consumidor ativo confirmado: `public/gestor/js/modals/funcionario_detalhes.js`

## Contrato runtime observado
- Sem sessão: `401` JSON de unauthorized emitido pelo guard de login.
- Fora do escopo contextual: `404` JSON `{ error: 'Funcionário não encontrado' }`.
- Funcionário inexistente: `404` JSON `{ error: 'Funcionário não encontrado' }`.
- `foto` em Data URL: `200` com buffer binário e `Content-Type` derivado do header da data URL.
- `foto` em URL pública: `302` com `Location` igual à URL e `Cache-Control: private, max-age=300`.
- `foto` em caminho legado de disco: `200` com `sendFile` e `Content-Type` inferido pela extensão.
- Sem foto configurada: `200` com placeholder SVG (`image/svg+xml`) e cache público.
- Falha interna induzida no ramo de redirect: `500` JSON no shape do erro central observado em runtime (`success: false`, `error: true`, `message: 'forced foto failure'`).

## Evidência executável
- Suíte focal criada: `tests/gestor-funcionarios-foto-runtime-contract.test.js`
- Execução validada: `node --test .\tests\gestor-funcionarios-foto-runtime-contract.test.js`
- Resultado final: `8` testes passando.

## Classificação
- Decisão: congelamento local.
- Motivo: o endpoint tem múltiplos ramos legítimos e observáveis de entrega de foto; não apareceu microrefactor de produção pequeno, isolado e claramente proporcional sem ampliar o corte desta rodada.