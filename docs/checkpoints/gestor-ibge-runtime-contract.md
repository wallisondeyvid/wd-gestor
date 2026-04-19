# Diagnóstico objetivo
O corredor GET /gestor/api/ibge está vencendo hoje pela implementação ligada a api.js no app montado do Gestor. Não houve patch de produção. Classificação: LACUNA_DE_COBERTURA_FECHADA.

---

## Caminho canônico observado
GET /gestor/api/ibge

## Vencedor runtime atual
- wiring: apiRouter é montado antes de miscApiRouter em src/modules/gestor/app/gestor-app.js
- rota vencedora: src/modules/gestor/app/routes/api.js
- controller vencedor: src/modules/gestor/app/controllers/apiController.js

## Contrato real observado
- sem parâmetros:
  - status: 400
  - body:
    - ok: false
    - success: false
    - error: "Parametro estado requerido"
- com apenas estado:
  - status: 200
  - body:
    - ok: true
    - total: inteiro positivo
    - municipios: array
- com estado + cidade existente:
  - status: 200
  - body:
    - ok: true
    - ibge: "3550308"
    - cidade: "São Paulo"
    - uf: "SP"
- com estado + cidade inexistente:
  - status: 404
  - body:
    - ok: false
    - success: false
    - error: "Cidade nao encontrada para UF"

## Prova focal criada
Arquivo: tests/gestor-ibge-runtime-contract.test.js

## Conclusão
- O runtime vencedor atual é o de api.js, não o de miscApi.js
- A duplicação permanece sem deduplicação nesta rodada
- A produção ficou inalterada