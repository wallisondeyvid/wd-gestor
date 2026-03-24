Posto de congelamento local do endpoint POST /gestor/api/funcionarios/:id/delete no corredor de funcionarios do Gestor.

Escopo fechado

- Producao observada: [src/modules/gestor/app/controllers/funcionarioApiController.js](src/modules/gestor/app/controllers/funcionarioApiController.js)
- Router montado: [src/modules/gestor/app/routes/funcionarioApi.js](src/modules/gestor/app/routes/funcionarioApi.js)
- Mount real: [src/modules/gestor/app/gestor-app.js](src/modules/gestor/app/gestor-app.js)
- Guardrail focal: [tests/gestor-funcionarios-delete-post-runtime-contract.test.js](tests/gestor-funcionarios-delete-post-runtime-contract.test.js)
- Consumidor vivo principal: [views/gestor/funcionarios/funcionarios_index.ejs](views/gestor/funcionarios/funcionarios_index.ejs) com interceptacao em [public/gestor/js/pages/funcionarios_index.js](public/gestor/js/pages/funcionarios_index.js) e fallback em [public/js/funcionarios/funcionarios_index.js](public/js/funcionarios/funcionarios_index.js)

Owner runtime

- Metodo e path congelados: POST /gestor/api/funcionarios/:id/delete
- Owner runtime direto: deleteFuncionarioPost em [src/modules/gestor/app/controllers/funcionarioApiController.js](src/modules/gestor/app/controllers/funcionarioApiController.js)
- Gate de entrada: requireLogin + requireUnitScope no router de funcionarios
- Persistencia efetiva: findFuncionarioById, findUserByFuncionarioId e deleteFuncionarioById via bridge/db do Gestor

Contrato runtime congelado

- Sem sessao: responde 401 JSON com success=false, code=UNAUTHORIZED e error de nao autenticado; nao redireciona.
- Fora do escopo contextual: responde 200 JSON com success=true, data.deleted=true, data.alreadyRemoved=true e data.redirect=/funcionarios?deleted=1; o alvo permanece intacto.
- Alvo vinculado a usuario master: responde 403 JSON com success=false, code=FORBIDDEN e mensagem explicita de bloqueio.
- Sucesso: responde 200 JSON com success=true, data.deleted=true e data.redirect=/funcionarios?deleted=1&nome=<nome-url-encoded>; o registro e removido.
- Id inexistente: responde 200 JSON com success=true, data.deleted=true, data.alreadyRemoved=true e data.redirect=/funcionarios?deleted=1.
- Idempotencia observavel: repeticao apos sucesso volta ao mesmo ramo alreadyRemoved com 200 JSON.
- Falha interna induzida no owner: responde 500 JSON com success=false e mensagem normalizada para erro interno.
- Redirect vs JSON: o handler retorna JSON tambem no caminho POST de delete; o campo redirect e apenas dado de saida para o consumidor.

Consumidor vivo principal

- A listagem de funcionarios monta formulario POST para /api/funcionarios/:id/delete na propria tabela.
- O script da pagina intercepta submit, confirma exclusao e faz fetch POST esperando JSON.
- O fallback legado da pagina replica o mesmo contrato de consumo.

Evidencia executavel

- Comando validado: node --test .\tests\gestor-funcionarios-delete-post-runtime-contract.test.js
- Resultado congelado nesta rodada: 7 testes, 7 passes, 0 fails.

Decisao final

- Classificacao: ponto de congelamento.
- Motivo: o handler local ja e curto, o owner esta claro, o contrato montado foi congelado por suite dedicada e nao apareceu microrefactor local com ganho proporcional ao risco.
- Nenhum patch de producao foi necessario nesta rodada.