let registryReaderOverride = null;

export function readUnitDatabaseRegistry({ unidadeId } = {}) {
  if (typeof registryReaderOverride === 'function') {
    return registryReaderOverride({ unidadeId });
  }

  return null;
}

export function __setUnitDatabaseRegistryReaderForTests(reader) {
  registryReaderOverride = typeof reader === 'function' ? reader : null;
}

export function __resetUnitDatabaseRegistryReaderForTests() {
  registryReaderOverride = null;
}