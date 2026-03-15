# Diagnóstico objetivo
O endpoint GET /gestor/api/bancos está PROTEGIDO no wiring real. Sem sessão, responde 401 com envelope JSON padronizado de erro de autenticação. Não houve patch de produção. Classificação: LACUNA_DE_COBERTURA_FECHADA.

---

## Caminho canônico
GET /gestor/api/bancos

## Contrato real observado (sem sessão)
- status: 401
- content-type: application/json
- body:
  - success: false
  - error: "Não autenticado"
  - code: "UNAUTHORIZED"

## Teste criado
Arquivo: tests/bancoApi.contract.test.js
O teste automatizado valida que, sem sessão, o endpoint retorna exatamente o contrato acima.

## Conclusão
- Endpoint PROTEGIDO no wiring real
- Não houve patch de produção
- Classificação final: LACUNA_DE_COBERTURA_FECHADA
