# Testes utilitários de controller Funcionário

## Verificação de import
Executa uma checagem rápida para garantir que não exista SyntaxError ou export ausente no controller:

```bash
node scripts/test-import-funcionario-controller.js
```

Retornos esperados:
- Código 0: import bem-sucedido e função `createFuncionario` presente.
- Código 1: erro de import (ex.: SyntaxError).
- Código 2: import OK mas função essencial ausente.

## Próximos passos sugeridos
- Adicionar testes de validação de payload (ex.: datas inválidas, CPF duplicado mockado).
- Mock de Mongoose para testar `createFuncionario` isolado (ex.: usando `mongodb-memory-server`).
