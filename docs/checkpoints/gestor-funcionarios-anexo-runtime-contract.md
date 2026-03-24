Ponto de congelamento local do endpoint GET /gestor/api/funcionarios/:id/anexo/:idx no corredor de funcionarios do Gestor.

Escopo fechado

- Producao observada: [src/modules/gestor/app/controllers/funcionarioApiController.js](src/modules/gestor/app/controllers/funcionarioApiController.js)
- Router montado: [src/modules/gestor/app/routes/funcionarioApi.js](src/modules/gestor/app/routes/funcionarioApi.js)
- Mount real: [src/modules/gestor/app/gestor-app.js](src/modules/gestor/app/gestor-app.js)
- Guardrail focal: [tests/gestor-funcionarios-anexo-runtime-contract.test.js](tests/gestor-funcionarios-anexo-runtime-contract.test.js)
- Consumidor vivo principal: [public/gestor/js/modals/funcionario_detalhes.js](public/gestor/js/modals/funcionario_detalhes.js), carregado pela tela [views/gestor/funcionarios/funcionarios_index.ejs](views/gestor/funcionarios/funcionarios_index.ejs)

Owner runtime

- Metodo e path congelados: GET /gestor/api/funcionarios/:id/anexo/:idx
- Owner runtime direto: downloadAnexoFuncionario em [src/modules/gestor/app/controllers/funcionarioApiController.js](src/modules/gestor/app/controllers/funcionarioApiController.js)
- Gate de entrada: requireLogin + requireUnitScope no router de funcionarios
- Persistencia efetiva: findFuncionarioById por escopo contextual, seguido de resolucao de caminho e stream via fs

Contrato runtime congelado

- Sem sessao: responde 401 JSON com success=false, code=UNAUTHORIZED e envelope de nao autenticado.
- Fora do escopo contextual: responde 404 texto simples com Funcionário não encontrado.
- Funcionario inexistente: responde 404 texto simples com Funcionário não encontrado.
- Indice invalido: responde 404 texto simples com Anexo não encontrado.
- Arquivo ausente no servidor: responde 404 texto simples com Arquivo ausente no servidor.
- Sucesso: responde 200 por stream do arquivo, com Content-Type vindo de anexo.mime e Content-Disposition inline com filename URL-encoded; sem redirect e sem JSON.
- Falha interna induzida no stream: responde 500 texto simples com Erro ao baixar anexo.

Consumidor vivo principal

- O modal de detalhes lista anexos do funcionario e monta href para /api/funcionarios/:id/anexo/:idx.
- O clique abre o recurso em nova aba e depende de resposta por stream, nao de JSON.

Evidencia executavel

- Comando validado: node --test .\tests\gestor-funcionarios-anexo-runtime-contract.test.js
- Resultado congelado nesta rodada: 7 testes, 7 passes, 0 fails.

Decisao final

- Classificacao: ponto de congelamento.
- Motivo: o handler local ja e curto, o owner esta claro, o contrato montado foi congelado por suite dedicada e nao apareceu microrefactor local com ganho proporcional ao risco.
- Nenhum patch de producao foi necessario nesta rodada.