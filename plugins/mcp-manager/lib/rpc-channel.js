/**
 * RPC 通道注册的兼容层。
 *
 * DSH 0.1.5-rc.1 起，官方 `@deepseek-ai/dsh-client-connection` 把 `webServer`
 * 从自身 `inject` 中移除，却又在 `HostConnectionService.register()` 里读取
 * `owner.webServer`，导致任何调用 `ctx.connection.rpc.handle(...)` 的宿主插件在
 * 加载期就报 `cannot get property "webServer" without inject`，进而拖垮整个
 * DSH 启动。调用方无论怎样声明 `inject` 都无法改变该行为。
 *
 * 因此这里先尝试官方注册路径；只有当它因该缺陷失败时，才回退到由插件自己通过
 * `ctx.webServer.register()` 注册同一条通道，并复刻官方线上协议：
 * POST `<channel>/<endpoint>`，请求体 `{ type: 'client-request', rpcId, method,
 * payload }`，响应体 `{ type: 'server-response', rpcId, result }`。同时复用
 * `ctx.connection.requestRejection()` 保留 Host/Origin 与浏览器会话鉴权。
 *
 * 官方修复后，官方路径会重新生效，回退分支不会再被触发。
 */

const CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/u;
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/u;
const JSON_CONTENT_TYPE = 'application/json';
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function fail(message) {
  throw new TypeError(message);
}

function assertChannel(channel) {
  if (typeof channel !== 'string' || !CHANNEL_PATTERN.test(channel) || channel === '/api') {
    fail(`rpc-channel: 无效或保留的 RPC 通道 ${JSON.stringify(channel)}`);
  }
}

function isValidEndpoint(endpoint) {
  return typeof endpoint === 'string'
    && endpoint.length > 0
    && !endpoint.split('/').some((segment) =>
      segment === ''
      || segment === '.'
      || segment === '..'
      || !ENDPOINT_SEGMENT_PATTERN.test(segment));
}

/** 该缺陷的加载期报错；只在官方注册路径上匹配。 */
export function isConnectionWebServerDefect(error) {
  return error instanceof Error
    && /webServer/u.test(error.message)
    && /without inject|inactive context/u.test(error.message);
}

function endpointFromPath(channel, pathname) {
  if (!pathname.startsWith(`${channel}/`)) return undefined;
  const endpoint = pathname.slice(channel.length + 1);
  return isValidEndpoint(endpoint) ? endpoint : undefined;
}

function fullResponse(rpcId, result) {
  return {
    type: 'server-response',
    rpcId,
    result,
  };
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': JSON_CONTENT_TYPE,
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readJsonBody(request) {
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > MAX_BODY_BYTES) {
      fail('rpc-channel: 请求体超过安全上限');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * 回退通道的请求处理：先做鉴权，再校验信封，最后把结果封回 `server-response`。
 * @param ctx - 宿主插件上下文，用于 `requestRejection`。
 * @param channel - 绝对通道前缀，例如 `/mcp-manager`。
 * @param handler - 返回 `{ ok, value }` 或 `{ ok: false, error }` 的端点处理器。
 * @param request - node:http 请求。
 * @param response - node:http 响应。
 */
export async function handleFallbackRequest(ctx, channel, handler, request, response) {
  const reject = ctx.connection?.requestRejection;
  if (typeof reject === 'function') {
    const rejection = reject.call(ctx.connection, request);
    if (rejection !== undefined) {
      response.writeHead(rejection);
      response.end(rejection === 401 ? 'unauthorized' : 'forbidden');
      return;
    }
  }
  const url = new URL(request.url ?? '/', 'http://dsh.internal');
  const endpoint = endpointFromPath(channel, url.pathname);
  if (request.method !== 'POST' || endpoint === undefined) {
    response.writeHead(404);
    response.end();
    return;
  }
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== JSON_CONTENT_TYPE) {
    response.writeHead(415);
    response.end();
    return;
  }
  let envelope;
  try {
    envelope = await readJsonBody(request);
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }
  const rpcId = typeof envelope?.rpcId === 'string' ? envelope.rpcId : undefined;
  if (
    envelope?.type !== 'client-request'
    || rpcId === undefined
    || typeof envelope.method !== 'string'
  ) {
    sendJson(response, 200, fullResponse(rpcId ?? 'invalid-request', {
      ok: false,
      error: {
        code: 'gateway/bad-request',
        message: 'invalid client-request message',
        details: {},
      },
    }));
    return;
  }
  if (envelope.method !== endpoint) {
    sendJson(response, 200, fullResponse(rpcId, {
      ok: false,
      error: {
        code: 'gateway/bad-request',
        message: `method ${JSON.stringify(envelope.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
        details: {},
      },
    }));
    return;
  }
  let result;
  try {
    result = await handler(endpoint, envelope.payload);
  } catch (error) {
    response.writeHead(500);
    response.end(`handler failure: ${String(error)}`);
    return;
  }
  sendJson(response, 200, fullResponse(rpcId, result));
}

/**
 * 在 `ctx` 上注册一条 RPC 通道，返回异步 disposer。
 * @param ctx - 宿主插件上下文，需已注入 `connection` 与 `webServer`。
 * @param channel - 绝对通道前缀。
 * @param handler - 端点处理器 `(endpoint, payload) => Promise<result>`。
 * @returns 释放该通道的异步 disposer。
 */
export async function registerRpcChannel(ctx, channel, handler) {
  assertChannel(channel);
  try {
    return await ctx.connection.rpc.handle(channel, (endpoint, payload) =>
      handler(endpoint, payload));
  } catch (error) {
    if (!isConnectionWebServerDefect(error)) throw error;
  }
  if (typeof ctx.webServer?.register !== 'function') {
    throw new Error('rpc-channel: webServer 不可用，无法回退注册 RPC 通道');
  }
  const dispose = ctx.webServer.register({
    kind: 'prefix',
    path: channel,
    handler: (request, response) =>
      handleFallbackRequest(ctx, channel, handler, request, response),
  });
  return async () => {
    await dispose();
  };
}
