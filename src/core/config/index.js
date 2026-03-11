// Carregamento e validação básica de configuração
import fs from 'fs';
import path from 'path';
import { loadFeatureFlagsFromEnv } from './featureFlags.js';

function loadJsonIfExists(p){
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return {}; }
}

export function loadConfig() {
  const env = process.env.NODE_ENV || 'development';
  const root = process.cwd();
  const baseFile = path.join(root, 'config.json');
  const envFile = path.join(root, `config.${env}.json`);
  const base = loadJsonIfExists(baseFile);
  const envC = loadJsonIfExists(envFile);

  // Permitir alias MONGODB_URI além de MONGO_URI
  const envMongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || undefined;
  const memFlag = (process.env.MONGO_MEMORY || '').toString().trim().toLowerCase();
  const forceMemory = memFlag === '1' || memFlag === 'true' || memFlag === 'on' || memFlag === 'yes';

  const defaultFeatureFlags = {
    escalas: false,
    gestor_auth_context_resolver: false,
  };

  const cfg = {
    env,
    port: parseInt(process.env.PORT || base.port || 3000, 10),
    mongoUri: forceMemory ? undefined : (envMongoUri || envC.mongoUri || base.mongoUri),
    sessionSecret: process.env.SESSION_SECRET || envC.sessionSecret || base.sessionSecret || 'dev-secret',
    featureFlags: loadFeatureFlagsFromEnv(defaultFeatureFlags),
  };

  // Validação mínima
  if (!cfg.mongoUri && !forceMemory) {
    console.warn('[config] mongoUri não definido (MONGO_URI/MONGODB_URI ausentes); usando fallback local.');
    cfg.mongoUri = 'mongodb://localhost:27017/wdgestor';
  }
  try {
    if (forceMemory) {
      console.log('[mongo] modo memória forçado via MONGO_MEMORY=' + (process.env.MONGO_MEMORY || '1'));
      console.log('[config] mongoUri efetiva = (in-memory)');
    } else {
      console.log('[config] mongoUri efetiva =', cfg.mongoUri.replace(/:\/\/[\w-]+:[^@]+@/,'://<hidden>:<hidden>@'));
    }
  } catch {}
  return cfg;
}
