// Wrapper do submódulo Portal do Morador
import portalMoradorApp from './app/portal-morador-app.js';

export const meta = {
  name: 'portal-morador',
  version: '0.1.0',
  basePath: '/portal-morador',
  displayName: 'Portal do Morador',
  init: async () => { /* Hooks futuros */ },
};

export function buildModule() {
  return portalMoradorApp;
}

export default buildModule;
