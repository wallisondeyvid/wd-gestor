import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const RESULT_PREFIX = '__RESULT__';

function runScenario(name, code) {
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', code],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
      encoding: 'utf8',
      timeout: 120000,
    },
  );

  if (child.error) {
    throw child.error;
  }

  const stdout = String(child.stdout || '');
  const stderr = String(child.stderr || '');

  if (child.status !== 0) {
    throw new Error(
      [
        `[${name}] processo filho falhou com status ${child.status}`,
        '--- stdout ---',
        stdout,
        '--- stderr ---',
        stderr,
      ].join('\n'),
    );
  }

  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const resultLine = [...lines].reverse().find((line) => line.startsWith(RESULT_PREFIX));

  assert.ok(resultLine, `[${name}] não encontrou linha de resultado com prefixo ${RESULT_PREFIX}`);

  return JSON.parse(resultLine.slice(RESULT_PREFIX.length));
}

test('createServer: ENABLE_GESTOR_WRAPPER OFF e ON mantem a mesma assinatura macro de montagem do Gestor', () => {
  const result = runScenario(
    'gestor-wrapper-parity-off-on',
    `
      const { createServer } = await import('./src/server/createServer.js');

      function describeGestorMount(app) {
        const stack = (app && app._router && Array.isArray(app._router.stack)) ? app._router.stack : [];
        const mounts = stack.filter((layer) => {
          const rx = layer && layer.regexp;
          const name = String((layer && layer.name) || '');
          return name === 'mounted_app' && rx instanceof RegExp && rx.test('/gestor');
        });

        const mountedApp = mounts[0] && mounts[0].handle;

        return {
          mountCount: mounts.length,
          layerName: mounts[0] ? String(mounts[0].name || '') : '',
          regexpSource: mounts[0] && mounts[0].regexp instanceof RegExp ? mounts[0].regexp.source : '',
          mountedHandleType: typeof mountedApp,
        };
      }

      process.env.ENABLE_GESTOR_WRAPPER = '0';
      const offBuilt = await createServer({ skipDb: true, deferErrorHandlers: true });
      const off = describeGestorMount(offBuilt.app);
      await offBuilt.close({ stopMemoryServer: true });

      process.env.ENABLE_GESTOR_WRAPPER = '1';
      const onBuilt = await createServer({ skipDb: true, deferErrorHandlers: true });
      const on = describeGestorMount(onBuilt.app);
      await onBuilt.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ off, on }));
    `,
  );

  assert.deepEqual(
    result.off,
    result.on,
    'OFF e ON devem manter a mesma assinatura macro de montagem do Gestor neste primeiro recorte',
  );
  assert.equal(result.off.mountCount, 1, 'Gestor deve permanecer montado uma unica vez no servidor');
  assert.ok(
    result.off.mountedHandleType === 'function' || result.off.mountedHandleType === 'object',
    'mount do Gestor deve continuar expondo um handler montado valido no servidor',
  );
  assert.equal(result.off.layerName, 'mounted_app', 'Gestor deve continuar entrando no servidor como sub-app montado');
  assert.ok(result.off.regexpSource.length > 0, 'mount do Gestor deve continuar com assinatura de path relevante no servidor');
});