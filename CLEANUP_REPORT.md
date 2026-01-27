## Relatório de Limpeza (Autogerado)

Data: 2025-09-20

### Objetivo
Remover arquivos legados/dúbios para reduzir confusão entre a versão modular (modules/gestor & modules/escalas) e restos do monólito anterior.

### Arquivos Removidos

| Caminho | Motivo |
|---------|--------|
| `gestor-app.js` (raiz) | Fragmento residual sem integração; código incompleto e não importado. |
| `src/gestor-app.js` | Placeholder legado lançando exceção; substituído por `src/modules/gestor/app/gestor-app.js`. |
| `views/escalas/esquecisenha-avancada-escalas.ejs` | Unificado em `views/gestor/esquecisenha-avancada.ejs` (parametrizado). |

### Arquivos Mantidos (mesmo que pareçam semelhantes)

| Caminho | Justificativa |
|---------|---------------|
| `src/modules/gestor/app/gestor-app.js` | Entry point real do módulo Gestor. |
| `public/js/gestor-app.js` | Script front-end (tabs / formulário funcionários) ainda potencialmente referenciado pelas views Gestor. |
| `views/gestor/*` | Base de templates compartilhados (reutilizados por Escalas via múltiplos diretórios de views). |
| `views/escalas/login-escalas.ejs` | Página de login específica do módulo Escalas (branding separado). |
| `views/gestor/esquecisenha-avancada.ejs` | Novo template compartilhado (substitui versão exclusiva de Escalas). |

### Próximas Sugestões (Opcional)
1. Unificar `esquecisenha-avancada-escalas.ejs` criando versão genérica (`gestor/esquecisenha-avancada.ejs`).
2. Introduzir helper `renderShared(res, view, opts)` para eliminar repetição de `moduleLabel` e `basePath` em rotas.
3. Auditar `public/js/gestor-app.js` para modularizar apenas o que é usado nas páginas atuais (possível split por feature). 
4. Criar script de CI que falha se arquivos legacy conhecidos forem reintroduzidos.

### Script de Verificação (Exemplo)
Adicionar em `package.json`:

```json
{
  "scripts": {
    "verify:legacy": "node scripts/verify-no-legacy.js"
  }
}
```

### Conclusão
Limpeza aplicada sem impacto em rotas ativas. Estrutura agora reflete claramente a arquitetura modular em produção.
