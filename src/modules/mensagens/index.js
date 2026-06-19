// Wrapper do módulo Caixa de Mensagens
import mensagensApp from './app/mensagens-app.js';

export const meta = {
  name: 'mensagens',
  version: '0.1.0',
  basePath: '/mensagens',
  displayName: 'Caixa de Mensagens',
  init: async () => { /* hooks futuros */ },
};

export function buildModule() {
  return mensagensApp;
}

export default buildModule;
