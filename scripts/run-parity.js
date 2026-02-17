import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWin = process.platform === 'win32';
const isHuskyOrCi = process.env.HUSKY === '1' || process.env.CI === 'true';
const shouldForceExit = isWin || isHuskyOrCi;
const parityDebug = String(process.env.PARITY_DEBUG || '').trim() === '1';

const defaultHardTimeoutMs = isHuskyOrCi
  ? 120000
  : (isWin ? 300000 : 0);
const parsedHardTimeoutMs = Number(process.env.PARITY_HARD_TIMEOUT_MS ?? defaultHardTimeoutMs);
const hardTimeoutMs = Number.isFinite(parsedHardTimeoutMs) ? Math.max(0, parsedHardTimeoutMs) : defaultHardTimeoutMs;

const diagFile = path.join(
  os.tmpdir(),
  `parity-watchdog-${Date.now()}-${process.pid}.log`
);

function appendDiag(message) {
  try {
    fs.appendFileSync(diagFile, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch {}
}

function mergedNodeOptionsWithTraceExit() {
  const current = String(process.env.NODE_OPTIONS || '').trim();
  if (!parityDebug) return current;
  if (current.includes('--trace-exit')) return current;
  return current ? `${current} --trace-exit` : '--trace-exit';
}

const testArgs = ['--test'];
if (shouldForceExit) testArgs.push('--test-force-exit');
testArgs.push('tests/condominios.v2.parity.test.js', 'tests/condominios.v2.parity.matrix.test.js');

const childNodeOptions = mergedNodeOptionsWithTraceExit();

const child = spawn(process.execPath, testArgs, {
  env: {
    ...process.env,
    PARITY: '1',
    MONGO_MEMORY: String(process.env.MONGO_MEMORY ?? '1'),
    DISABLE_HID: String(process.env.DISABLE_HID ?? '1'),
    SKIP_HID: String(process.env.SKIP_HID ?? '1'),
    SKIP_BIOMETRIA: String(process.env.SKIP_BIOMETRIA ?? '1'),
    DISABLE_BIOMETRIA: String(process.env.DISABLE_BIOMETRIA ?? '1'),
    DISABLE_CONDOMINIOS_BG_JOBS: String(process.env.DISABLE_CONDOMINIOS_BG_JOBS ?? '1'),
    PARITY_RUNNER: '1',
    PARITY_DIAG_FILE: diagFile,
    ...(childNodeOptions ? { NODE_OPTIONS: childNodeOptions } : {})
  },
  stdio: 'inherit',
  shell: false
});

appendDiag(`[parity] child pid=${child.pid} args=${JSON.stringify(testArgs)}`);

let hardTimeout = null;
let escalationTimeout = null;
let timedOut = false;

function debugDump(label) {
  if (!parityDebug) return;
  try {
    const handles = typeof process._getActiveHandles === 'function' ? process._getActiveHandles() : [];
    const requests = typeof process._getActiveRequests === 'function' ? process._getActiveRequests() : [];
    console.error(`[parity][debug] ${label} handles=${handles.length} requests=${requests.length}`);
    appendDiag(`[parity][debug] ${label} handles=${handles.length} requests=${requests.length}`);
  } catch (err) {
    try { console.error('[parity][debug] dump falhou:', err?.message || err); } catch {}
    appendDiag(`[parity][debug] dump falhou: ${err?.message || err}`);
  }
}

function clearTimers() {
  if (hardTimeout) {
    clearTimeout(hardTimeout);
    hardTimeout = null;
  }
  if (escalationTimeout) {
    clearTimeout(escalationTimeout);
    escalationTimeout = null;
  }
}

function killTreeWindows(pid) {
  if (!isWin || !pid) return;
  try {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: false,
      windowsHide: true
    });
    killer.on('error', () => {});
  } catch {}
}

if (hardTimeoutMs > 0) {
  hardTimeout = setTimeout(() => {
    timedOut = true;
    try { console.error(`[parity] hard-timeout (${hardTimeoutMs}ms)`); } catch {}
    appendDiag(`[parity] hard-timeout (${hardTimeoutMs}ms)`);
    debugDump('hard-timeout');

    try { child.kill('SIGTERM'); } catch {}

    escalationTimeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        try { child.kill(); } catch {}
      }
      if (isWin && child.pid) {
        killTreeWindows(child.pid);
      }
      appendDiag('[parity] escalation: child.kill() + taskkill /T /F (win32)');
      process.exit(1);
    }, 1000);

    escalationTimeout.unref?.();
  }, hardTimeoutMs);

  hardTimeout.unref?.();
}

function forwardSignal(signal) {
  try { child.kill(signal); } catch {}
}

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('error', (err) => {
  clearTimers();
  console.error('[parity] falha ao iniciar runner:', err);
  appendDiag(`[parity] spawn error: ${err?.message || err}`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  clearTimers();
  debugDump('close');
  appendDiag(`[parity] close code=${String(code)} signal=${String(signal || '')}`);

  if (timedOut) {
    process.exit(1);
  }

  if (typeof code === 'number') {
    process.exit(code);
  }

  console.error('[parity] processo encerrado por sinal:', signal || 'desconhecido');
  process.exit(1);
});
