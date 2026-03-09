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

  try {
    return JSON.parse(resultLine.slice(RESULT_PREFIX.length));
  } catch (err) {
    throw new Error(
      [
        `[${name}] falha ao parsear JSON do cenário`,
        `linha: ${resultLine}`,
        `erro: ${err instanceof Error ? err.message : String(err)}`,
      ].join('\n'),
    );
  }
}

test('createServer: repetição no mesmo processo não deveria duplicar mount do Escalas', () => {
  const result = runScenario(
    'duplicate-escalas-mounts',
    `
      process.env.ENABLE_ESCALAS = '1';

      const { createServer } = await import('./src/server/createServer.js');

      function countMountedAppForPath(app, pathName) {
        const stack = (app && app._router && Array.isArray(app._router.stack))
          ? app._router.stack
          : [];
        return stack.filter((layer) => {
          const rx = layer && layer.regexp;
          const name = String((layer && layer.name) || '');
          return name === 'mounted_app' && rx instanceof RegExp && rx.test(pathName);
        }).length;
      }

      const first = await createServer({ skipDb: true, deferErrorHandlers: true });
      const firstEscalasMounts = countMountedAppForPath(first.app, '/escalas');
      await first.close({ stopMemoryServer: true });

      const second = await createServer({ skipDb: true, deferErrorHandlers: true });
      const secondEscalasMounts = countMountedAppForPath(second.app, '/escalas');
      await second.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ firstEscalasMounts, secondEscalasMounts }));
    `,
  );

  assert.equal(result.firstEscalasMounts, 1, 'primeira inicialização deve montar Escalas uma vez');
  assert.equal(
    result.secondEscalasMounts,
    1,
    'segunda inicialização não deve acumular mount extra de Escalas',
  );
});

test('createServer: alternância ENABLE_ESCALAS 1->0 não deveria herdar mount anterior', () => {
  const result = runScenario(
    'toggle-escalas-flag',
    `
      process.env.ENABLE_ESCALAS = '1';

      const { createServer } = await import('./src/server/createServer.js');

      function countMountedAppForPath(app, pathName) {
        const stack = (app && app._router && Array.isArray(app._router.stack))
          ? app._router.stack
          : [];
        return stack.filter((layer) => {
          const rx = layer && layer.regexp;
          const name = String((layer && layer.name) || '');
          return name === 'mounted_app' && rx instanceof RegExp && rx.test(pathName);
        }).length;
      }

      const first = await createServer({ skipDb: true, deferErrorHandlers: true });
      const firstEscalasMounts = countMountedAppForPath(first.app, '/escalas');
      await first.close({ stopMemoryServer: true });

      process.env.ENABLE_ESCALAS = '0';
      const second = await createServer({ skipDb: true, deferErrorHandlers: true });
      const secondEscalasMounts = countMountedAppForPath(second.app, '/escalas');
      await second.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ firstEscalasMounts, secondEscalasMounts }));
    `,
  );

  assert.equal(result.firstEscalasMounts, 1, 'setup inicial deve montar Escalas uma vez');
  assert.equal(result.secondEscalasMounts, 0, 'com ENABLE_ESCALAS=0 não deve herdar mount de Escalas');
});

test('createServer: sub-app singleton não deveria ficar preso ao parent da última inicialização', () => {
  const result = runScenario(
    'portal-parent-contamination',
    `
      process.env.ENABLE_ESCALAS = '0';

      const { createServer } = await import('./src/server/createServer.js');
      const portalModule = await import('./src/modules/portal-morador/index.js');

      const first = await createServer({ skipDb: true, deferErrorHandlers: true });
      const second = await createServer({ skipDb: true, deferErrorHandlers: true });

      const portalApp = portalModule.buildModule({});

      const portalParentIsFirst = !!portalApp && portalApp.parent === first.app;
      const portalParentIsSecond = !!portalApp && portalApp.parent === second.app;

      await first.close({ stopMemoryServer: true });
      await second.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ portalParentIsFirst, portalParentIsSecond }));
    `,
  );

  assert.equal(
    result.portalParentIsFirst,
    false,
    'sub-app novo não deveria manter referência ao parent do primeiro servidor',
  );
  assert.equal(
    result.portalParentIsSecond,
    false,
    'sub-app novo não deveria manter referência ao parent do segundo servidor',
  );
});

test('createServer: sub-app de condominios nao deve ficar preso ao parent da ultima inicializacao', () => {
  const result = runScenario(
    'condominios-parent-isolation',
    `
      process.env.ENABLE_ESCALAS = '0';

      const { createServer } = await import('./src/server/createServer.js');
      const condominiosModule = await import('./src/modules/condominios/index.js');

      const first = await createServer({ skipDb: true, deferErrorHandlers: true });
      const second = await createServer({ skipDb: true, deferErrorHandlers: true });

      const condominiosApp = condominiosModule.buildModule({});
      const parentIsFirst = !!condominiosApp && condominiosApp.parent === first.app;
      const parentIsSecond = !!condominiosApp && condominiosApp.parent === second.app;

      await first.close({ stopMemoryServer: true });
      await second.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ parentIsFirst, parentIsSecond }));
    `,
  );

  assert.equal(
    result.parentIsFirst,
    false,
    'sub-app isolado de condominios nao deve manter parent do primeiro bootstrap',
  );
  assert.equal(
    result.parentIsSecond,
    false,
    'sub-app isolado de condominios nao deve manter parent do segundo bootstrap',
  );
});

test('createServer: alias /portal_morador monta o mesmo sub-app do portal', () => {
  const result = runScenario(
    'portal-underscore-alias',
    `
      process.env.ENABLE_ESCALAS = '0';

      const { createServer } = await import('./src/server/createServer.js');

      function countMountedAppForPath(app, pathName) {
        const stack = (app && app._router && Array.isArray(app._router.stack))
          ? app._router.stack
          : [];
        return stack.filter((layer) => {
          const rx = layer && layer.regexp;
          const name = String((layer && layer.name) || '');
          return name === 'mounted_app' && rx instanceof RegExp && rx.test(pathName);
        }).length;
      }

      const built = await createServer({ skipDb: true, deferErrorHandlers: true });
      const canonicalPortalMounts = countMountedAppForPath(built.app, '/portal-morador');
      const underscoreAliasMounts = countMountedAppForPath(built.app, '/portal_morador');
      await built.close({ stopMemoryServer: true });

      console.log('${RESULT_PREFIX}' + JSON.stringify({ canonicalPortalMounts, underscoreAliasMounts }));
    `,
  );

  assert.ok(result.canonicalPortalMounts >= 1, 'mount canônico /portal-morador deve existir');
  assert.equal(
    result.underscoreAliasMounts,
    1,
    'alias /portal_morador deve montar uma vez o sub-app do portal',
  );
});
