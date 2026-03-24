# Checkpoint: POST /gestor/api/funcionarios

## Escopo
- Endpoint congelado: `POST /gestor/api/funcionarios`
- Owner/runtime relido: `src/modules/gestor/app/controllers/funcionarioApiController.js` (`createFuncionario`)
- Consumidor vivo principal: formulário principal da tela de funcionários do Gestor em `views/gestor/funcionarios/funcionarios_index.ejs`, com fallback de envio em `public/gestor/js/pages/funcionarios_index.js`
- Mount real confirmado em `src/modules/gestor/app/gestor-app.js`
- Rota montada confirmada em `src/modules/gestor/app/routes/funcionarioApi.js`

## Boundary congelado
- Esta subfase congela o create base observável do owner atual.
- Os gates de sessão, escopo, requireds e CPF duplicado fecham antes da criação e antes do autoUser.
- No caminho de sucesso, o owner atual sempre retorna o bloco `autoUser` no payload; ele foi tratado como parte do contrato runtime observado, sem ampliar o escopo para refactor de produção.

## Contrato runtime congelado
- Sem sessão: `401` JSON com `success: false` e `code: 'UNAUTHORIZED'`.
- Fora do escopo contextual: `404` JSON com `success: false`, `code: 'NOT_FOUND'` e `message: 'Unidade não encontrada'`.
- Requireds ausentes: `400` JSON com `success: false`, `code: 'BAD_REQUEST'`, `message: 'Campos obrigatórios ausentes'` e `campos` contendo `rg`, `data_nascimento`, `sexo`, `endereco`, `email`, `telefone` e `endereco[cep]` para o payload mínimo inválido congelado.
- CPF duplicado na mesma unidade: `400` JSON com `success: false`, `code: 'BAD_REQUEST'` e `message: 'Já existe um funcionário cadastrado com este CPF nesta empresa.'`, sem criar novo documento.
- Sucesso mínimo: `201` JSON com `success: true`, `created: true`, `id` no topo e `data.id` duplicando o identificador criado.
- Sucesso mínimo ainda expõe `data.autoUser` com `ok: true`, `outcome: 'created'`, `reusedUser: false`, `membershipCreated: true`, `funcionarioLinked: true` e `legacyUserLinked: false`.
- Falha interna induzida no create do tenant: `500` JSON com `success: false`, `code: 'SERVER_ERROR'` e `message: 'Erro interno'`.

## Persistência observada no sucesso mínimo
- O funcionário é persistido apenas no tenant da unidade ativa contextual.
- O usuário global é criado para o e-mail do funcionário.
- O membership global é criado para a unidade do funcionário.
- O documento do funcionário criado recebe `usuario_id` apontando para o usuário automático.

## Evidência executável
- Suíte focal: `tests/gestor-funcionarios-create-runtime-contract.test.js`
- Execução validada nesta linha de trabalho: `node --test .\tests\gestor-funcionarios-create-runtime-contract.test.js`
- Resultado final congelado: `6` testes passando.

## Observações de runtime
- O caminho mínimo de sucesso disparou a infraestrutura real de autoUser, incluindo criação de usuário e membership.
- No runtime observado, `legacyUserLinked` permaneceu `false` no sucesso mínimo, mesmo com usuário e membership criados corretamente.
- A falha interna genérica do owner atual retorna `Erro interno` porque o catch chama `serverError(res, 'Erro ao cadastrar funcionário')`, e `serverError` usa `error?.message` quando recebe string.

## Classificação final
- Decisão: ponto de congelamento local da subfase de criação base.
- Motivo: foi possível congelar o contrato do create sem tocar produção e sem forçar uma separação artificial do bloco `autoUser` no único ramo em que ele é inevitável.

## Confirmação explícita
- Produção não foi alterada.
- Frontend não foi alterado.
- Apenas a suíte focal e este checkpoint foram criados nesta rodada.