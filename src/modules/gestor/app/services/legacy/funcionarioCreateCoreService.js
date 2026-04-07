import { executeCreateFuncionarioCore } from '#modules/gestor/app/usecases/funcionarios/executeCreateFuncionarioCore.js';

export async function executeCreateFuncionarioCoreService(input) {
  return executeCreateFuncionarioCore(input);
}