// Wrapper do módulo Gestor
import gestorApp from './app/gestor-app.js';

// Seeds (legado migrado) serão carregadas sob demanda
async function runGestorSeeds() {
  const shouldSeed = process.env.GESTOR_SEEDS === '1' || process.env.SEEDS === '1';
  if (!shouldSeed) return;
  try {
    const { ensureMasterUser, cleanupWrongEmail } = await import('#modules/gestor-seeds.js');
    await ensureMasterUser();
    await cleanupWrongEmail();
    console.log('[gestor][seeds] concluído');
  } catch (err) {
    console.error('[gestor][seeds] falha:', err.message);
  }
}

export const meta = {
  name: 'gestor',
  version: '1.0.0',
  basePath: '/gestor', // módulo agora montado sob /gestor
  init: runGestorSeeds, // hook opcional
};

// Mantém API consistente caso futuramente seja necessário criar nova instância
export function buildModule(/* core */) {
  return gestorApp();
}

export default buildModule;
