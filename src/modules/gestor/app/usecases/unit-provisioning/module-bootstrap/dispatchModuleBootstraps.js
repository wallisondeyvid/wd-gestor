import { bootstrapCondominioModule } from '#modules/gestor/app/usecases/unit-provisioning/module-bootstrap/condominio.bootstrap.js';
import { bootstrapClinicaModule } from '#modules/gestor/app/usecases/unit-provisioning/module-bootstrap/clinica.bootstrap.js';
import { bootstrapEscalasModule } from '#modules/gestor/app/usecases/unit-provisioning/module-bootstrap/escalas.bootstrap.js';

const MODULE_BOOTSTRAP_HANDLERS = new Map([
  ['condominio', bootstrapCondominioModule],
  ['clinica', bootstrapClinicaModule],
  ['escalas', bootstrapEscalasModule],
]);

const MODULE_BOOTSTRAP_KEYS = new Set(['condominio', 'clinica', 'escalas']);

function normalizeRawModuleValue(rawValue) {
  return String(rawValue || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeEnabledModules(modulosHabilitados) {
  if (!Array.isArray(modulosHabilitados)) return [];

  const normalized = [];
  const known = new Set();

  for (const rawValue of modulosHabilitados) {
    const value = String(rawValue || '').trim();
    if (!value) continue;
    if (known.has(value)) continue;
    known.add(value);
    normalized.push(value);
  }

  return normalized;
}

function normalizeRequestedModuleKeys(targetModuleKeys) {
  if (!Array.isArray(targetModuleKeys)) return [];

  const normalized = [];
  const known = new Set();

  for (const rawValue of targetModuleKeys) {
    const moduleKey = resolveModuleKey(rawValue);
    if (!moduleKey) continue;
    if (known.has(moduleKey)) continue;
    known.add(moduleKey);
    normalized.push(moduleKey);
  }

  return normalized;
}

function looksLikeObjectId(rawValue) {
  return /^[a-f\d]{24}$/i.test(String(rawValue || '').trim());
}

function resolveModuleKey(rawValue) {
  const normalized = normalizeRawModuleValue(rawValue).replace(/^\/+/, '');
  if (!normalized) return null;

  if (MODULE_BOOTSTRAP_KEYS.has(normalized)) return normalized;

  const compact = normalized.replace(/[\s_-]+/g, '');

  if (compact.includes('condominio')) return 'condominio';
  if (compact.includes('clinica')) return 'clinica';
  if (compact.includes('escala')) return 'escalas';

  return null;
}

function resolveModuleKeyFromDescriptor(descriptor) {
  const keyFromNome = resolveModuleKey(descriptor?.nome);
  if (keyFromNome) return keyFromNome;

  const keyFromUrlBase = resolveModuleKey(descriptor?.url_base);
  if (keyFromUrlBase) return keyFromUrlBase;

  return null;
}

function buildModuleDocMap(moduloDocs) {
  const map = new Map();

  for (const moduloDoc of moduloDocs || []) {
    const id = String(moduloDoc?._id || '').trim();
    if (!id) continue;
    map.set(id, moduloDoc);
  }

  return map;
}

async function resolveModuleBootstrapKeys({ modulosHabilitados, repository }) {
  const normalizedModules = normalizeEnabledModules(modulosHabilitados);
  const resolvedKeys = [];
  const knownKeys = new Set();
  const unresolvedObjectIds = [];
  const unknownModules = [];

  for (const rawModule of normalizedModules) {
    const key = resolveModuleKey(rawModule);
    if (key) {
      if (!knownKeys.has(key)) {
        knownKeys.add(key);
        resolvedKeys.push(key);
      }
      continue;
    }

    if (looksLikeObjectId(rawModule)) {
      unresolvedObjectIds.push(rawModule);
      continue;
    }

    unknownModules.push(rawModule);
  }

  if (unresolvedObjectIds.length > 0) {
    const moduloDocs = await repository.findGlobalModulosByIds({
      moduloIds: unresolvedObjectIds,
    });

    const moduleDocById = buildModuleDocMap(moduloDocs);

    for (const moduloId of unresolvedObjectIds) {
      const moduloDoc = moduleDocById.get(moduloId);
      if (!moduloDoc) {
        unknownModules.push(moduloId);
        continue;
      }

      const moduleKey = resolveModuleKeyFromDescriptor(moduloDoc);
      if (!moduleKey) {
        unknownModules.push(moduloDoc.nome || moduloDoc.url_base || moduloId);
        continue;
      }

      if (knownKeys.has(moduleKey)) continue;
      knownKeys.add(moduleKey);
      resolvedKeys.push(moduleKey);
    }
  }

  return {
    normalizedModules,
    resolvedKeys,
    unknownModules,
  };
}

export async function dispatchModuleBootstraps({ unidadeId, dbName, modulosHabilitados, repository, targetModuleKeys }) {
  const resolution = await resolveModuleBootstrapKeys({
    modulosHabilitados,
    repository,
  });

  const normalizedTargetModuleKeys = normalizeRequestedModuleKeys(targetModuleKeys);
  const hasTargetFilter = normalizedTargetModuleKeys.length > 0;
  const targetModuleKeySet = new Set(normalizedTargetModuleKeys);
  const resolvedModuleKeySet = new Set(resolution.resolvedKeys);

  const selectedModuleKeys = hasTargetFilter
    ? resolution.resolvedKeys.filter((moduleKey) => targetModuleKeySet.has(moduleKey))
    : [...resolution.resolvedKeys];
  const skippedModuleKeys = hasTargetFilter
    ? resolution.resolvedKeys.filter((moduleKey) => !targetModuleKeySet.has(moduleKey))
    : [];
  const targetOutOfScopeModuleKeys = hasTargetFilter
    ? normalizedTargetModuleKeys.filter((moduleKey) => !resolvedModuleKeySet.has(moduleKey))
    : [];

  for (const unknownModule of resolution.unknownModules) {
    console.warn('[UnitProvisioningService] modulo sem bootstrap registrado; ignorando', {
      unidadeId,
      modulo: unknownModule,
    });
  }

  if (targetOutOfScopeModuleKeys.length > 0) {
    console.warn('[UnitProvisioningService] modulo alvo fora do escopo habilitado da unidade; ignorando', {
      unidadeId,
      targetOutOfScopeModuleKeys,
    });
  }

  const executed = [];
  const executedModuleKeys = [];

  for (const moduleKey of selectedModuleKeys) {
    const bootstrapHandler = MODULE_BOOTSTRAP_HANDLERS.get(moduleKey);
    if (!bootstrapHandler) {
      console.warn('[UnitProvisioningService] bootstrap handler ausente; ignorando', {
        unidadeId,
        moduleKey,
      });
      continue;
    }

    const result = await bootstrapHandler({
      unidadeId,
      dbName,
      repository,
    });

    executed.push(result);
    executedModuleKeys.push(moduleKey);
  }

  return {
    requestedModules: resolution.normalizedModules,
    resolvedModuleKeys: resolution.resolvedKeys,
    unknownModules: resolution.unknownModules,
    targetModuleKeys: normalizedTargetModuleKeys,
    selectedModuleKeys,
    skippedModuleKeys,
    targetOutOfScopeModuleKeys,
    executedModuleKeys,
    executed,
  };
}

export default dispatchModuleBootstraps;
