import assert from 'node:assert/strict';
import request from 'supertest';

export async function assertOfflineContract({ createServer, path, query = {} }) {
  const created = await createServer({ skipDb: true });
  const app = created?.app;
  const close = typeof created?.close === 'function' ? created.close : null;

  try {
    const res = await request(app).get(path).query(query);

    assert.equal(res.status, 503);
    assert.equal(String(res.headers['retry-after'] || ''), '5');
    assert.equal(res.body?.success, false);
    assert.equal(typeof res.body?.error, 'string');
    assert.ok(res.body.error.length > 0);
    assert.equal(Object.prototype.hasOwnProperty.call(res.body || {}, 'code'), false);
  } finally {
    if (close) {
      await close({ stopMemoryServer: true });
    }
  }
}
