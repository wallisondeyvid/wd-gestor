# Estrutura de Assets do Módulo Gestor

## Resumo da Migração
Foram migrados os arquivos de estilo específicos do módulo Gestor de `public/css/` para `public/gestor/css/` para isolar escopo e evitar conflitos com outros módulos / área pública.

| Antes                            | Depois                              | Status |
|----------------------------------|-------------------------------------|--------|
| /css/gestor-app.css              | /gestor/css/gestor-app.css          | Migrado |
| /css/modais.css                  | /gestor/css/modais.css              | Migrado |
| /css/icons.css                   | /gestor/css/icons.css               | Migrado |

Os arquivos antigos em `/public/css/` foram substituídos por stubs mínimos contendo apenas um comentário de migração. Isso permite fallback temporário caso alguma página externa em cache ainda referencie o caminho antigo.

## Diretórios Atuais
```
public/
  gestor/
    css/
      gestor-app.css
      modais.css
      icons.css
```

## Referências Atualizadas
Todas as views e parciais do módulo Gestor agora usam `<link rel="stylesheet" href="/gestor/css/...">`.
Parciais globais (`header.ejs`, `navbar.ejs`) também foram ajustadas.

## Como Utilizar Novos Estilos
- Para páginas internas do módulo Gestor: sempre usar os novos caminhos.
- Evitar reintroduzir referências a `/css/gestor-app.css` etc.; esses stubs serão removidos em limpeza futura.

## Próxima Limpeza (Futura)
Após uma janela de monitoramento (ex.: 1 semana ou primeiro deploy estável), remover completamente:
```
public/css/gestor-app.css
public/css/modais.css
public/css/icons.css
```

## Boas Práticas Adotadas
- Escopo modular reduz risco de colisão com estilos legacy.
- Comentários de migração deixam clara a intenção e facilitam auditoria.
- Uso de nomes consistentes permite automação futura (ex.: build/pipeline de purge).

## Ações Pendentes (Opcional)
- Avaliar se alguma regra de `modais.css` poderia ser quebrada em componentes menores.
- Adicionar versão/hash nos links (ex.: `?v=YYYYMMDD`) em pipeline de deploy.
- Padronizar tokens (cores, espaçamentos) em arquivo de design tokens central.

---
Documento gerado automaticamente como parte da higienização de assets do módulo Gestor.
