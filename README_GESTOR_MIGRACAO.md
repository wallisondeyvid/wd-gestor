# Migração Namespace JavaScript - Módulo Gestor

## Objetivo
Isolar e organizar o JavaScript do módulo Gestor em uma hierarquia clara, reduzindo acoplamento, eliminando duplicações e preparando terreno para futura build (bundler, tree-shaking, testes automatizados).

## Estrutura Nova (`/public/gestor/js`)
```
core/      -> Utilidades e inicializações compartilhadas (masks, dates, validators, dom helpers, datepicker-init)
vendor/    -> Bibliotecas de terceiros (flatpickr + locale)
modules/   -> Módulos de domínio (diretor, filiais, pix, tipo-unidade...)
modals/    -> Scripts específicos de cada modal reutilizável
pages/     -> Scripts de páginas completas (login, unidades, funcionarios_index, perfil, etc.)
```

## Fases da Migração
1. Levantamento e cópia 1:1 (paridade) dos arquivos originais para `/gestor/js`.
2. Criação de stubs nos caminhos antigos delegando para os novos (rollback instantâneo).
3. Substituição piloto em `unidades.ejs` (validação de dependências: máscaras, modals, vendor, pix, flatpickr).
4. Correção de defeitos detectados (ex: sintaxe em `unidades.js`, funções faltantes em `funcionarios_index.js`).
5. Migração global de referências de script nas views para o novo namespace.
6. Eliminação de referências residuais a `/js/` (exceto domínios fora de escopo: `escalas`, `mediapipe`).
7. Inclusão de página faltante (`contato.js`) no namespace gestor.
8. Preparação para remoção dos legados (aguardando regressão).

## Convenções
- Arquivos de página: `pages/<nome>.js` (snake_case quando já herdado). Futuro: padronizar camelCase ou kebab.
- Módulos de domínio: `modules/<contexto>-module.js`.
- Modais: nome direto do modal, referência única por funcionalidade.
- Nenhuma lógica de negócios nos stubs; apenas redirecionamento.

## Checklist de Regressão (Executar antes de remover legados)
Autenticação:
- Login sucesso / erro credenciais.
- Fluxo esqueci senha (requisição enviada).
- Primeiro acesso (se aplicável) carrega sem exceptions.

Unidades:
- Carrega página sem 404/ReferenceError.
- Máscaras CNPJ/CEP/Telefone ativas.
- Flatpickr abre em campos de data.
- Criar, editar, salvar e listar unidade.
- Modais associados (endereço, CNAE principal/secundário, natureza jurídica) funcionam.

Funcionários:
- Cadastro navega por todas as abas.
- Campos com máscaras e selects dinâmicos carregam.
- Modais (CBO, sindicato, categoria trabalhador, tipo contrato, setor, função) abrem e retornam dados.
- Upload/benefícios serializam corretamente.
- Datas com flatpickr e formatação correta no payload.
- Biometria (se em ambiente com hardware) não quebra inicialização.

Perfil / Recursos:
- Página perfil salva ajuste simples.
- Recursos lista e abre modal seleção módulos.

Contato:
- Página contato carrega sem 404 no script.

Console / Network:
- Sem `ReferenceError` ou 404 para `/js/...` (exceto domínios não migrados intencionalmente).
- Flatpickr locale carregado (`pt`).

## Critério de Remoção dos Legados
Remover apenas após regressão completa sem regressões críticas.
Classificação A (removível): stubs de pages, core/utils duplicados, modals, modules e vendor duplicado.
Manter por ora: `escalas/`, `mediapipe/` (fora de escopo), qualquer asset sem equivalente.

## Rollback Rápido
1. Reverter commit de remoção (`git revert <hash>` ou checkout branch anterior).
2. (Opcional) Recolocar temporariamente uma view para usar caminho antigo se surgir bug localizado.
3. Investigar diferença entre gestor vs legado no script específico antes de novo rollout.

## Próximos Passos (Futuros / Não Executados Ainda)
- Adicionar bundler (Vite/Rollup/ESBuild) para agrupar módulos.
- Introduzir lint (ESLint + Prettier) e testes (Jest) para core utils.
- Converter scripts modais para padrão modular (export functions + import central).
- Implementar lazy loading para modais pouco usados.
- Padronizar nomenclatura (decidir entre snake_case e camelCase para arquivos futuros).
- Integrar feature flags para habilitar novas implementações lado a lado.

## Decisões e Observações
- `app.js` referenciado em `base_funcionarios.ejs` parecia órfão (arquivo inexistente). Mantido comentário TODO caso alguma lógica desapareça.
- `contato.js` não existia: criado placeholder para evitar 404.
- `gestor-app.js` (lado servidor) permanece fora do escopo de assets front-end.
- Biometria permanece com lógica inline extensa; futuro: extrair para módulo dedicado.

## Estrutura Pós-Remoção Esperada (Resumo)
```
/public/gestor/js/
  core/
  vendor/
  modules/
  modals/
  pages/
```
Nenhum uso direto de `/js/` em views Gestor, exceto domínios isolados.

## Autoria / Histórico
Migração conduzida em setembro/2025. Ver commits anotados com prefixo `feat(gestor-migracao)` ou similar.

---
Se encontrar divergência entre comportamento antigo e novo, comparar stub antigo e gestor correspondente para detectar lógica perdida.
