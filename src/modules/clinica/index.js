// Wrapper do módulo Clínica
import clinicaApp from './app/clinica-app.js';

export const meta = {
  name: 'clinica',
  version: '0.1.0',
  basePath: '/clinica',
  displayName: 'Clínica',
  init: async () => { /* hooks futuros (seeds, caches) */ },
};

export function buildModule() {
  return clinicaApp;
}

export default buildModule;
