import assert from 'node:assert/strict';
import request from 'supertest';

export function assertOfflineResponseContract(res, { allowMissingRetryAfter = false } = {}) {
  assert.equal(res.status, 503);

  const retryAfter = String(res.headers?.['retry-after'] || '');
  if (!allowMissingRetryAfter || retryAfter) {
    assert.equal(retryAfter, '5');
  }

  const ok = res.body?.success ?? res.body?.ok;
  assert.equal(ok, false);
  assert.equal(typeof res.body?.error, 'string');
  assert.ok(res.body.error.length > 0);
  assert.equal(Object.prototype.hasOwnProperty.call(res.body || {}, 'code'), false);
}

export async function assertOfflineContract({ createServer, path, query = {}, allowMissingRetryAfter = false }) {
  const created = await createServer({ skipDb: true });
  const app = created?.app;
  const close = typeof created?.close === 'function' ? created.close : null;

  try {
    const res = await request(app)
      .get(path)
      .set('Accept', 'application/json')
      .set('Connection', 'close')
      .query(query);

    assertOfflineResponseContract(res, { allowMissingRetryAfter });
  } finally {
    if (close) {
      await close({ stopMemoryServer: true });
    }
  }
}
