// Conexão centralizada com MongoDB
import mongoose from 'mongoose';
import { closeAllDbConnections } from '#shared/db/connectionFactory.js';
import { clearResolveConnectionCache } from '#shared/db/resolveConnection.js';
let MemoryServer; // lazy import

const GLOBAL_CACHE_KEY = '__wdgestorMongoCache__';

function getGlobalCache() {
  const g = globalThis;
  if (!g[GLOBAL_CACHE_KEY]) {
    g[GLOBAL_CACHE_KEY] = { conn: null, promise: null, listenersInstalled: false, mem: null, memUri: null };
  }
  return g[GLOBAL_CACHE_KEY];
}

export async function disconnectMongo({ stopMemoryServer = true } = {}) {
  const cache = getGlobalCache();
  try { await closeAllDbConnections(); } catch { /* noop */ }
  try { clearResolveConnectionCache(); } catch { /* noop */ }
  try { await mongoose.disconnect(); } catch { /* noop */ }
  cache.conn = null;
  cache.promise = null;

  if (stopMemoryServer && cache.mem) {
    try { await cache.mem.stop(); } catch { /* noop */ }
    cache.mem = null;
    cache.memUri = null;
  }
}

function isServerlessRuntime() {
  return !!(process.env.VERCEL || process.env.VERCEL_URL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function redactMongoUri(mongoUri) {
  try {
    const s = String(mongoUri || '');
    // mongodb+srv://user:pass@host/db?x=y
    return s.replace(/(mongodb(?:\+srv)?:\/\/)([^@/\s]+)@/i, (_m, p1) => `${p1}***:***@`);
  } catch {
    return '[mongo-uri]';
  }
}

function installMongooseListenersOnce(cache, mongoUri) {
  if (cache.listenersInstalled) return;
  cache.listenersInstalled = true;

  try {
    const conn = mongoose.connection;
    conn.on('connected', () => {
      cache.conn = conn;
      try {
        console.log('[mongo] connected:', redactMongoUri(mongoUri));
      } catch {
        /* noop */
      }
    });
    conn.on('disconnected', () => {
      cache.conn = null;
      try {
        console.warn('[mongo] disconnected');
      } catch {
        /* noop */
      }
    });
    conn.on('error', (err) => {
      try {
        console.error('[mongo] error:', err?.message || err);
      } catch {
        console.error('[mongo] error');
      }
    });
  } catch {
    /* noop */
  }
}

async function waitForMongoConnected(timeoutMs = 8000) {
  if (mongoose.connection.readyState === 1) return true;
  const ms = Math.max(250, Number(timeoutMs) || 0);
  return await new Promise((resolve) => {
    const conn = mongoose.connection;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { conn.off('connected', onConnected); } catch {}
      try { conn.off('error', onError); } catch {}
      resolve(mongoose.connection.readyState === 1);
    }, ms);

    function cleanup(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { conn.off('connected', onConnected); } catch {}
      try { conn.off('error', onError); } catch {}
      resolve(!!ok);
    }

    function onConnected() { cleanup(true); }
    function onError() { cleanup(false); }

    try { conn.once('connected', onConnected); } catch { /* noop */ }
    try { conn.once('error', onError); } catch { /* noop */ }
  });
}

export async function connectMongo(uri, options = {}) {
  const cache = getGlobalCache();
  // Se temos cache mas a conexão caiu, permita reconectar.
  try {
    if (cache.conn && mongoose.connection.readyState !== 1) {
      cache.conn = null;
    }
  } catch {
    /* noop */
  }
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  if (cache.promise) return cache.promise;

  const memFlag = (process.env.MONGO_MEMORY || '').toString().trim().toLowerCase();
  const useMemory = memFlag === '1' || memFlag === 'true' || memFlag === 'on' || memFlag === 'yes';
  const mongoUri = useMemory ? null : (uri || process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/gestor');
  const logTargetUri = useMemory ? '(in-memory)' : mongoUri;
  const serverless = isServerlessRuntime();
  // Em serverless, valores muito altos deixam a UX travada quando o cluster está sem primary.
  // Preferimos falhar mais rápido (com 503/erro claro) do que segurar 20s+.
  const defaultServerSelectionTimeout = serverless ? 8000 : 5000;
  const defaultConnectTimeout = serverless ? 8000 : 8000;
  const defaultSocketTimeout = serverless ? 20000 : 20000;

  // Se env vars estiverem definidas com valores muito baixos, aplica um mínimo seguro.
  const minServerSelectionTimeout = serverless ? 8000 : 0;
  const minConnectTimeout = serverless ? 8000 : 0;
  const minSocketTimeout = serverless ? 20000 : 0;

  const rawSst = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || defaultServerSelectionTimeout);
  const rawCt = Number(process.env.MONGO_CONNECT_TIMEOUT_MS || defaultConnectTimeout);
  const rawSt = Number(process.env.MONGO_SOCKET_TIMEOUT_MS || defaultSocketTimeout);
  const rawHeartbeat = Number(process.env.MONGO_HEARTBEAT_MS || (serverless ? 8000 : 10000));
  const forceIPv4 = (() => {
    const flag = String(process.env.MONGO_FORCE_IPV4 || '').trim().toLowerCase();
    if (flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes') return true;
    return serverless; // prefer IPv4 em serverless para evitar resoluções AAAA quebradas
  })();
  const defaultOpts = {
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 10),
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 0),
    serverSelectionTimeoutMS: Math.max(rawSst, minServerSelectionTimeout),
    connectTimeoutMS: Math.max(rawCt, minConnectTimeout),
    socketTimeoutMS: Math.max(rawSt, minSocketTimeout),
    heartbeatFrequencyMS: Math.max(rawHeartbeat, 4000),
    retryReads: true,
    retryWrites: true,
    appName: process.env.MONGO_APP_NAME || 'wdgestor-serverless',
  };
  if (forceIPv4) {
    defaultOpts.family = 4;
  }

  installMongooseListenersOnce(cache, logTargetUri);

  cache.promise = (async () => {
    // Se alguém já disparou o connect (readyState=2) fora deste helper,
    // aguarde um curto período para evitar "openUri on active connection".
    if (mongoose.connection.readyState === 2) {
      const ok = await waitForMongoConnected(defaultOpts.serverSelectionTimeoutMS);
      if (ok) {
        cache.conn = mongoose.connection;
        return cache.conn;
      }
      // Cai para o fluxo normal de connect (pode falhar rápido e liberar retry).
    }

    if (!useMemory) {
      try {
        // Se o driver ficou em estado ruim, encerra antes de tentar reconnect.
        if (mongoose.connection.readyState === 3) {
          try { await mongoose.disconnect(); } catch { /* noop */ }
        }
        console.log("🔎 Tentando conectar no Mongo:", mongoUri);
        await mongoose.connect(mongoUri, { ...defaultOpts, ...options });
        console.log("✅ Mongo conectado");
        const conn = mongoose.connection;
        cache.conn = conn;
        return conn;
      } catch (err) {
        console.error("❌ Falha conexão Mongo:", err);
        console.warn('[mongo] falha conexão primária:', err?.message || err);
        const fbFlag = (process.env.FALLBACK_MEM_ON_FAIL || '').toString().trim().toLowerCase();
        const allowFallback = fbFlag === '1' || fbFlag === 'true' || fbFlag === 'on' || fbFlag === 'yes';
        if (!allowFallback) {
          throw new Error(
            `[mongo] Não foi possível conectar em "${redactMongoUri(mongoUri)}". ` +
            'Verifique MONGO_URI (ou MONGODB_URI) e o acesso de rede no Atlas (IP Access List / Private Networking). ' +
            'Para usar banco em memória SOMENTE em dev/teste, defina MONGO_MEMORY=1.\n' +
            `Erro original: ${err?.message || err}`
          );
        }
        console.warn('[mongo] fallback para memória habilitado (FALLBACK_MEM_ON_FAIL).');
        if (!MemoryServer) {
          const { MongoMemoryServer } = await import('mongodb-memory-server');
          MemoryServer = MongoMemoryServer;
        }
        if (cache.mem) {
          try { await cache.mem.stop(); } catch { /* noop */ }
          cache.mem = null;
          cache.memUri = null;
        }
        const mem = await MemoryServer.create();
        const memUri = mem.getUri();
        cache.mem = mem;
        cache.memUri = memUri;
        console.log("🔎 Tentando conectar no Mongo:", memUri);
        await mongoose.connect(memUri, { ...defaultOpts, ...options });
        console.log("✅ Mongo conectado");
        const conn = mongoose.connection;
        console.log('[mongo] conectado em memória (fallback):', memUri);
        cache.conn = conn;
        return conn;
      }
    }

    // Modo memória habilitado explicitamente
    console.log('[mongo] modo memória forçado via MONGO_MEMORY=', process.env.MONGO_MEMORY);
    if (!MemoryServer) {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      MemoryServer = MongoMemoryServer;
    }
    if (cache.mem) {
      try { await cache.mem.stop(); } catch { /* noop */ }
      cache.mem = null;
      cache.memUri = null;
    }
    const mem = await MemoryServer.create();
    const memUri = mem.getUri();
    cache.mem = mem;
    cache.memUri = memUri;
    console.log("🔎 Tentando conectar no Mongo:", memUri);
    await mongoose.connect(memUri, { ...defaultOpts, ...options });
    console.log("✅ Mongo conectado");
    const conn = mongoose.connection;
    console.log('[mongo] conectado em memória:', memUri);
    cache.conn = conn;
    return conn;
  })();

  try {
    return await cache.promise;
  } finally {
    // Se a promise falhar, liberamos para permitir retry em uma próxima tentativa.
    // Se sucesso, cache.conn já está preenchido e cache.promise não é mais necessária.
    cache.promise = null;
  }
}

export function getConnection(){
  const cache = getGlobalCache();
  if (!cache.conn) throw new Error('Mongo não conectado. Chame connectMongo primeiro.');
  return cache.conn;
}
