import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  isConnectionWebServerDefect,
  registerRpcChannel,
} from '../plugins/mcp-manager/lib/rpc-channel.js';

const DEFECT_MESSAGE = 'cannot get property "webServer" without inject';

/**
 * 模拟 DSH webserver：保存注册的 prefix 路由并按最长前缀派发请求。
 */
async function withServer(routes, run) {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://dsh.internal').pathname;
    let match;
    for (const [prefix, route] of routes) {
      if (!pathname.startsWith(`${prefix}/`)) continue;
      if (match === undefined || prefix.length > match[0].length) {
        match = [prefix, route];
      }
    }
    if (match === undefined) {
      response.writeHead(404);
      response.end();
      return;
    }
    Promise.resolve(match[1](request, response)).catch((error) => {
      response.writeHead(500);
      response.end(String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function fakeWebServer() {
  const routes = new Map();
  return {
    routes,
    register(route) {
      routes.set(route.path, route.handler);
      return async () => {
        routes.delete(route.path);
      };
    },
  };
}

function context({ connection, webServer }) {
  return { connection, webServer };
}

async function post(base, path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  return { status: response.status, text, body: parsed };
}

test('isConnectionWebServerDefect only matches the upstream load-time regression', () => {
  assert.equal(isConnectionWebServerDefect(new Error(DEFECT_MESSAGE)), true);
  assert.equal(
    isConnectionWebServerDefect(
      new Error('cannot get required service "webServer" in inactive context'),
    ),
    true,
  );
  assert.equal(isConnectionWebServerDefect(new Error('webServer: duplicate route')), false);
  assert.equal(isConnectionWebServerDefect(new Error('boom')), false);
  assert.equal(isConnectionWebServerDefect('cannot get property without inject'), false);
});

test('official registration is used when connection.rpc.handle works', async () => {
  const webServer = fakeWebServer();
  const calls = [];
  const dispose = await registerRpcChannel(
    context({
      connection: {
        rpc: {
          async handle(channel, handler) {
            calls.push([channel, handler]);
            return async () => calls.push(['disposed']);
          },
        },
      },
      webServer,
    }),
    '/probe',
    async () => ({ ok: true, value: null }),
  );

  assert.deepEqual(calls.map(([channel]) => channel), ['/probe']);
  assert.equal(webServer.routes.size, 0);
  await dispose();
  assert.deepEqual(calls.at(-1), ['disposed']);
});

test('registration falls back to webServer when connection hits the regression', async () => {
  const webServer = fakeWebServer();
  const dispose = await registerRpcChannel(
    context({
      connection: {
        rpc: {
          handle() {
            throw new Error(DEFECT_MESSAGE);
          },
        },
      },
      webServer,
    }),
    '/probe',
    async (endpoint) => ({ ok: true, value: { endpoint } }),
  );

  assert.deepEqual([...webServer.routes.keys()], ['/probe']);
  await dispose();
  assert.equal(webServer.routes.size, 0);
});

test('unrelated registration failures still surface', async () => {
  const webServer = fakeWebServer();
  await assert.rejects(
    registerRpcChannel(
      context({
        connection: {
          rpc: {
            handle() {
              throw new Error('connection: invalid or reserved RPC channel "/api"');
            },
          },
        },
        webServer,
      }),
      '/probe',
      async () => ({ ok: true, value: null }),
    ),
    /invalid or reserved RPC channel/u,
  );
  await assert.rejects(
    registerRpcChannel(context({ connection: {}, webServer }), 'probe', async () => ({})),
    /无效或保留的 RPC 通道/u,
  );
});

test('fallback channel speaks the official client-response envelope', async () => {
  const webServer = fakeWebServer();
  const dispose = await registerRpcChannel(
    context({
      connection: { rpc: { handle() { throw new Error(DEFECT_MESSAGE); } } },
      webServer,
    }),
    '/probe',
    async (endpoint, payload) => ({ ok: true, value: { endpoint, payload } }),
  );
  try {
    await withServer(webServer.routes, async (base) => {
      const ok = await post(base, '/probe/list', {
        type: 'client-request',
        rpcId: 'rpc-1',
        method: 'list',
        payload: { revision: 3 },
      });
      assert.equal(ok.status, 200);
      assert.deepEqual(ok.body, {
        type: 'server-response',
        rpcId: 'rpc-1',
        result: { ok: true, value: { endpoint: 'list', payload: { revision: 3 } } },
      });

      const failure = await post(base, '/probe/execute', {
        type: 'client-request',
        rpcId: 'rpc-2',
        method: 'execute',
        payload: null,
      });
      assert.equal(failure.status, 200);
      assert.equal(failure.body.result.ok, true);
      assert.equal(failure.body.rpcId, 'rpc-2');
    });
  } finally {
    await dispose();
  }
});

test('fallback channel preserves controller failures inside the envelope', async () => {
  const webServer = fakeWebServer();
  const dispose = await registerRpcChannel(
    context({
      connection: { rpc: { handle() { throw new Error(DEFECT_MESSAGE); } } },
      webServer,
    }),
    '/probe',
    async () => ({
      ok: false,
      error: { code: 'TEST_FAILED', message: 'mcp-manager: 测试失败', details: {} },
    }),
  );
  try {
    await withServer(webServer.routes, async (base) => {
      const result = await post(base, '/probe/test', {
        type: 'client-request',
        rpcId: 'rpc-3',
        method: 'test',
        payload: {},
      });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.result, {
        ok: false,
        error: { code: 'TEST_FAILED', message: 'mcp-manager: 测试失败', details: {} },
      });
    });
  } finally {
    await dispose();
  }
});

test('fallback channel rejects wrong method, path, media type, and envelope', async () => {
  const webServer = fakeWebServer();
  const dispose = await registerRpcChannel(
    context({
      connection: { rpc: { handle() { throw new Error(DEFECT_MESSAGE); } } },
      webServer,
    }),
    '/probe',
    async () => ({ ok: true, value: null }),
  );
  try {
    await withServer(webServer.routes, async (base) => {
      const wrongMethod = await post(base, '/probe/list', {
        type: 'client-request',
        rpcId: 'rpc-4',
        method: 'other',
        payload: null,
      });
      assert.equal(wrongMethod.status, 200);
      assert.equal(wrongMethod.body.result.ok, false);
      assert.equal(wrongMethod.body.result.error.code, 'gateway/bad-request');

      const wrongPath = await post(base, '/probe', {
        type: 'client-request',
        rpcId: 'rpc-5',
        method: 'list',
        payload: null,
      });
      assert.equal(wrongPath.status, 404);

      const wrongType = await fetch(`${base}/probe/list`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      });
      assert.equal(wrongType.status, 415);

      const wrongEnvelope = await post(base, '/probe/list', { hello: 'world' });
      assert.equal(wrongEnvelope.status, 200);
      assert.equal(wrongEnvelope.body.result.error.code, 'gateway/bad-request');
    });
  } finally {
    await dispose();
  }
});

test('fallback channel keeps Connection browser authentication', async () => {
  const webServer = fakeWebServer();
  const seen = [];
  const dispose = await registerRpcChannel(
    context({
      connection: {
        rpc: { handle() { throw new Error(DEFECT_MESSAGE); } },
        requestRejection(request) {
          seen.push(request.url);
          return request.headers.cookie === undefined ? 401 : undefined;
        },
      },
      webServer,
    }),
    '/probe',
    async () => ({ ok: true, value: 'authenticated' }),
  );
  try {
    await withServer(webServer.routes, async (base) => {
      const rejected = await post(base, '/probe/list', {
        type: 'client-request',
        rpcId: 'rpc-6',
        method: 'list',
        payload: null,
      });
      assert.equal(rejected.status, 401);

      const allowed = await post(base, '/probe/list', {
        type: 'client-request',
        rpcId: 'rpc-7',
        method: 'list',
        payload: null,
      }, { cookie: 'dsh-session=ok' });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.body.result.value, 'authenticated');
    });
    assert.deepEqual(seen, ['/probe/list', '/probe/list']);
  } finally {
    await dispose();
  }
});
