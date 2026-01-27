// ARQUIVO LEGADO: gestor-app.legacy.js
// -------------------------------------------------------------
// Este arquivo contém o antigo monólito Express antes da migração
// para a arquitetura modular localizada em src/gestor/*.
// Mantido apenas como referência histórica temporária.
// NÃO É CARREGADO PELO SISTEMA EM PRODUÇÃO.
// Componentes migrados:
//  - Rotas API => controllers + routes em src/gestor/controllers e src/gestor/routes
//  - Views => pagesController/pagesRouter
//  - Bootstrap (DB, seeds) => src/gestor/bootstrap
//  - Utilidades (ex: CNPJ) => src/gestor/utils/cnpj.js
// Após validação final, este arquivo poderá ser removido.

// Conteúdo original removido para evitar confusão e reduzir tempo de lint/build.
// Caso precise consultar histórico completo, utilize o controle de versão (git log).

export default {};