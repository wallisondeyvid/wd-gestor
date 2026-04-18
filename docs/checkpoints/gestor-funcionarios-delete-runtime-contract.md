Posto de congelamento local do endpoint DELETE /gestor/api/funcionarios/:id no corredor de funcionarios do Gestor.

Escopo fechado

- Producao observada: [src/modules/gestor/app/controllers/funcionarioApiController.js](src/modules/gestor/app/controllers/funcionarioApiController.js)
- Router montado: [src/modules/gestor/app/routes/funcionarioApi.js](src/modules/gestor/app/routes/funcionarioApi.js)
- Persistencia efetiva: [src/modules/gestor/app/db/api.db.js](src/modules/gestor/app/db/api.db.js) e [src/modules/gestor/app/repositories/FuncionarioRepository.js](src/modules/gestor/app/repositories/FuncionarioRepository.js)
- Guardrail focal: [tests/gestor-funcionarios-delete-runtime-contract.test.js](tests/gestor-funcionarios-delete-runtime-contract.test.js)

Owner runtime

- Metodo e path congelados: DELETE /gestor/api/funcionarios/:id
- Owner runtime direto: deleteFuncionario em [src/modules/gestor/app/controllers/funcionarioApiController.js](src/modules/gestor/app/controllers/funcionarioApiController.js)
- Gate de entrada: requireLogin + requireUnitScope + withRequiredUnitScope no router de funcionarios
- Lookup do alvo: findFuncionarioById com unidade canonica
- Persistencia efetiva: deleteFuncionarioById via bridge/db do Gestor ate findOneAndDelete escopado por unidade quando existe contexto

Contrato runtime congelado

- Sem sessao: responde 401 JSON com success=false e code=UNAUTHORIZED.
- Fora do escopo contextual: responde 404 JSON com success=false, code=NOT_FOUND e error=Funcionário não encontrado; o alvo permanece intacto no tenant de origem.
- Funcionario inexistente: responde 404 JSON com success=false, code=NOT_FOUND e error=Funcionário não encontrado.
- Alvo vinculado a usuario master: responde 403 JSON com success=false, code=FORBIDDEN e mensagem explicita de bloqueio; o alvo permanece intacto.
- Sucesso no mesmo escopo: responde 200 JSON com success=true e data.deleted=true; o registro deixa de existir no tenant correto.

Observacoes do recorte

- O recorte permaneceu estritamente no DELETE vivo; nao abriu POST /:id/delete, PUT, GET, foto, anexo ou biometria.
- Todos os requests foram body-less; nao houve multipart nem req.files.
- A lacuna fechada aqui era de prova runtime focal, nao de estrutura.

Evidencia executavel

- Comando focal: node --test .\tests\gestor-funcionarios-delete-runtime-contract.test.js

Decisao final

- Classificacao: ponto de congelamento do corredor vivo DELETE /gestor/api/funcionarios/:id.
- Motivo: o endpoint agora fica coberto nos cinco cenarios minimos necessarios para borda, lookup escopado, bloqueio por master e persistencia tenant-aware.

Confirmacao explicita

- Producao nao foi alterada.
- Controller legado nao foi tocado.
- Router nao foi alterado.
- Bridge/db/repository nao foram alterados.
- Testes existentes nao foram alterados.
- Apenas a nova suite focal e este checkpoint novo foram criados nesta rodada.