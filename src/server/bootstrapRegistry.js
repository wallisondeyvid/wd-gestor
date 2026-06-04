import { randomUUID } from 'crypto';

const SUBAPP_X_POWERED_BY_DISABLED_FLAG = '__wdSubAppXPoweredByDisabled__';

function disableSubAppPoweredByHeader(appLike) {
  if (!appLike || typeof appLike.disable !== 'function') return;
  if (appLike[SUBAPP_X_POWERED_BY_DISABLED_FLAG]) return;

  appLike.disable('x-powered-by');
  Object.defineProperty(appLike, SUBAPP_X_POWERED_BY_DISABLED_FLAG, {
    value: true,
    configurable: true,
    enumerable: false,
    writable: false,
  });
}

async function importIsolatedApp(moduleAppPath) {
  const moduleUrl = new URL(moduleAppPath, import.meta.url);
  moduleUrl.searchParams.set('instance', `${Date.now()}-${randomUUID()}`);
  return (await import(moduleUrl.href)).default;
}

export async function buildIsolatedRegistryModule(moduleDefinition, moduleAppPath) {
  const isolatedApp = await importIsolatedApp(moduleAppPath);

  return {
    ...moduleDefinition,
    buildModule() {
      return isolatedApp;
    },
  };
}

export async function composeBootstrapRegistry({
  registry,
  isolatedRegistryEntries = [],
  enableEscalas = false,
  loadEscalasModule,
  onIsolationFailure,
  onEscalasLoadFailure,
} = {}) {
  for (const entry of isolatedRegistryEntries) {
    const idx = registry.findIndex((mod) => mod?.meta?.name === entry.name);
    if (idx < 0) continue;

    try {
      registry[idx] = await buildIsolatedRegistryModule(entry.moduleDefinition, entry.moduleAppPath);
    } catch (err) {
      onIsolationFailure?.(entry, err);
    }
  }

  if (enableEscalas) {
    try {
      const escalasModule = await loadEscalasModule();
      registry.push(escalasModule);
    } catch (err) {
      onEscalasLoadFailure?.(err);
    }
  }

  return registry;
}

export function mountBootstrapRegistry({
  app,
  registry,
  config,
  getEffectiveSkipDb,
  aliasByModuleName = {},
  onMounted,
} = {}) {
  for (const mod of registry) {
    const meta = mod.meta || { name: 'unknown', basePath: '/' };
    const built = mod.buildModule({ config });

    disableSubAppPoweredByHeader(built);

    try {
      if (built && built.locals) {
        built.locals.skipDb = getEffectiveSkipDb();

        if (app?.locals?.__skipDbForced) {
          built.locals.__skipDbForced = true;
        } else {
          delete built.locals.__skipDbForced;
        }
      }
    } catch {
      /* noop */
    }

    app.use(meta.basePath || '/', built);
    onMounted?.({ meta, basePath: meta.basePath || '/', aliasPath: null });

    const aliases = aliasByModuleName[meta.name] || [];
    for (const aliasPath of aliases) {
      app.use(aliasPath, built);
      onMounted?.({ meta, basePath: meta.basePath || '/', aliasPath });
    }
  }
}