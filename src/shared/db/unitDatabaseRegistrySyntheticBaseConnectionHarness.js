const UNIT_DATABASE_REGISTRY_COLLECTION = 'unit_database_registry';

function cloneValue(value) {
  if (value instanceof Date) {
    return new Date(value);
  }

  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)])
    );
  }

  return value;
}

function deleteNestedProperty(target, dottedPath) {
  const segments = String(dottedPath || '').split('.').filter(Boolean);
  if (segments.length === 0) return;

  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = current?.[segments[index]];
    if (!current || typeof current !== 'object') {
      return;
    }
  }

  delete current?.[segments[segments.length - 1]];
}

function normalizeUnidadeId(value) {
  return String(value || '').trim();
}

export function createSyntheticBaseConnectionHarness() {
  const store = new Map();

  const db = {
    collection(name) {
      if (name !== UNIT_DATABASE_REGISTRY_COLLECTION) {
        throw new Error('Synthetic base connection harness only supports unit_database_registry.');
      }

      return {
        async insertOne(document) {
          const unidadeId = normalizeUnidadeId(document?.unidadeId);
          store.set(unidadeId, cloneValue(document));
          return {
            acknowledged: true,
            insertedId: unidadeId,
          };
        },
        async findOne(filter) {
          const unidadeId = normalizeUnidadeId(filter?.unidadeId);
          return cloneValue(store.get(unidadeId) || null);
        },
        async updateOne(filter, update, options) {
          const unidadeId = normalizeUnidadeId(filter?.unidadeId);
          const existed = store.has(unidadeId);

          if (!existed && !options?.upsert) {
            return {
              acknowledged: true,
              matchedCount: 0,
              modifiedCount: 0,
              upsertedCount: 0,
            };
          }

          let nextEntry = cloneValue(store.get(unidadeId) || { unidadeId });

          if (update?.$set) {
            nextEntry = {
              ...nextEntry,
              ...cloneValue(update.$set),
            };
          }

          if (update?.$unset) {
            for (const fieldName of Object.keys(update.$unset)) {
              deleteNestedProperty(nextEntry, fieldName);
            }
          }

          store.set(unidadeId, nextEntry);

          return {
            acknowledged: true,
            matchedCount: existed ? 1 : 0,
            modifiedCount: 1,
            upsertedCount: existed ? 0 : 1,
          };
        },
      };
    },
  };

  const connection = {
    kind: 'synthetic-base-global',
    environment: 'synthetic',
    mode: 'memory',
    db,
  };

  return {
    connection,
    db,
    collection(name) {
      return db.collection(name);
    },
    read(unidadeId) {
      return cloneValue(store.get(normalizeUnidadeId(unidadeId)) || null);
    },
    reset() {
      store.clear();
    },
  };
}