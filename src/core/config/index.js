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

  const defaultFeatureFlags = {
    escalas: false,
  };

  const cfg = {
    env,
    port: parseInt(process.env.PORT || base.port || 3000, 10),
    mongoUri: envMongoUri || envC.mongoUri || base.mongoUri,
    sessionSecret: process.env.SESSION_SECRET || envC.sessionSecret || base.sessionSecret || 'dev-secret',
    featureFlags: loadFeatureFlagsFromEnv(defaultFeatureFlags),
  };

  // Validação mínima
  if (!cfg.mongoUri) {
    console.warn('[config] mongoUri não definido (MONGO_URI/MONGODB_URI ausentes); usando fallback local.');
    cfg.mongoUri = 'mongodb://localhost:27017/wdgestor';
  }
  try { console.log('[config] mongoUri efetiva =', cfg.mongoUri.replace(/:\/\/[\w-]+:[^@]+@/,'://<hidden>:<hidden>@')); } catch {}
  return cfg;
}
