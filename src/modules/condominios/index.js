// Wrapper do módulo Gestão de Condomínio
import condominiosApp from './app/condominios-app.js';

export const meta = {
  name: 'condominios',
  version: '0.1.0',
  basePath: '/condominios',
  displayName: 'Gestão de Condomínios',
  init: async () => { /* hooks futuros (seeds, caches) */ },
};

export function buildModule() {
  return condominiosApp;
}

export default buildModule;
