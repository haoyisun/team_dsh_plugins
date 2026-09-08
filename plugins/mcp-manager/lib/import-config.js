import { randomUUID } from 'node:crypto';
import { parseDocument } from 'yaml';

const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/u;
const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client';
const MAX_IMPORT_CHARS = 512 * 1024;
const MAX_IMPORT_SERVERS = 100;
const SENSITIVE_NAME =
  /(?:api[-_]?key|access[-_]?key|private|credential|token|secret|password|authorization|auth)/iu;
const PLACEHOLDER =
  /^(?:\$\{[^}]+\}|\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%|\{\{[^}]+\}\}|<[^>]+>|YOUR[_-][A-Z0-9_-]+|REPLACE[_-]?ME|CHANGEME)$/iu;
const SAFE_LITERAL_HEADERS = new Set([
  'accept',
  'content-type',
  'mcp-protocol-version',
  'user-agent',
]);
const METADATA_FIELDS = new Set([
  'alwaysAllow',
  'description',
  'disabled',
  'enabled',
  'icon',
]);
const COMMON_FIELDS = new Set([
  ...METADATA_FIELDS,
  'displayName',
  'name',
  'reconnect',
  'serverName',
  'timeout',
  'toolCallTimeoutMs',
  'transport',
  'type',
]);
const STDIO_FIELDS = new Set([
  ...COMMON_FIELDS,
  'args',
  'command',
  'cwd',
  'env',
]);
const HTTP_FIELDS = new Set([
  ...COMMON_FIELDS,
  'headers',
  'url',
]);
const PROFILE_ENTRY_FIELDS = new Set([
  'config',
  'disabled',
  'id',
  'name',
]);
const DEFAULT_RECONNECT = Object.freeze({
  enabled: true,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  maxAttempts: 10,
});

function importError(code, message) {
  const error = new TypeError(`mcp-manager: ${message}`);
  error.code = code;
  return error;
}

function stripCodeFence(input) {
  const trimmed = input.trim();
  const match = trimmed.match(
    /^```(?:json|jsonc|yaml|yml)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```$/iu,
  );
  return match ? { text: match[1], changed: true } : { text: trimmed, changed: false };
}

function stripJsonComments(input) {
  let result = '';
  let changed = false;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === '/' && next === '/') {
      changed = true;
      index += 2;
      while (index < input.length && !['\r', '\n'].includes(input[index])) index += 1;
      if (index < input.length) result += input[index];
      continue;
    }
    if (character === '/' && next === '*') {
      changed = true;
      result += ' ';
      index += 2;
      while (
        index < input.length
        && !(input[index] === '*' && input[index + 1] === '/')
      ) {
        if (input[index] === '\n') result += '\n';
        index += 1;
      }
      if (index >= input.length) {
        throw importError('IMPORT_PARSE_ERROR', 'JSONC 块注释没有结束');
      }
      index += 1;
      continue;
    }
    result += character;
  }
  return { text: result, changed };
}

function removeTrailingCommas(input) {
  let result = '';
  let changed = false;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ',') {
      let nextIndex = index + 1;
      while (/\s/u.test(input[nextIndex] ?? '')) nextIndex += 1;
      if (['}', ']'].includes(input[nextIndex])) {
        changed = true;
        continue;
      }
    }
    result += character;
  }
  return { text: result, changed };
}

function parseJsonc(input, notices) {
  const fenced = stripCodeFence(input);
  if (fenced.changed) {
    notices.push({
      level: 'repair',
      code: 'CODE_FENCE_REMOVED',
      path: '$',
      message: '已移除 Markdown 代码块标记。',
    });
  }
  try {
    const uncommented = stripJsonComments(fenced.text);
    const normalized = removeTrailingCommas(uncommented.text);
    const result = JSON.parse(normalized.text);
    if (uncommented.changed || normalized.changed) {
      notices.push({
        level: 'repair',
        code: 'JSONC_NORMALIZED',
        path: '$',
        message: '已兼容 JSONC 注释或尾逗号。',
      });
    }
    return result;
  } catch {
    // JSON/JSONC 解析失败后再尝试受限 YAML，避免改变现有 JSON 语义。
  }
  try {
    const document = parseDocument(fenced.text, {
      maxAliasCount: 0,
      prettyErrors: false,
      uniqueKeys: true,
    });
    if (document.errors.length > 0) throw document.errors[0];
    if (document.warnings.length > 0) throw document.warnings[0];
    const result = document.toJS({ maxAliasCount: 0 });
    notices.push({
      level: 'repair',
      code: 'YAML_PARSED',
      path: '$',
      message: '已按 YAML 配置解析。',
    });
    return result;
  } catch {
    throw importError(
      'IMPORT_PARSE_ERROR',
      '配置不是有效 JSON、JSONC 或 YAML，请检查缩进、引号和反斜杠转义',
    );
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeServer(value) {
  return isObject(value)
    && ['args', 'command', 'headers', 'transport', 'type', 'url']
      .some((key) => Object.hasOwn(value, key));
}

function serverEntries(root, notices) {
  if (Array.isArray(root)) {
    if (
      root.length === 0
      || root.some((patch) => !isObject(patch) || !Object.hasOwn(patch, 'insert'))
    ) {
      throw importError(
        'IMPORT_SHAPE_ERROR',
        'DSH Profile patch 根数组的每一项都必须包含 insert',
      );
    }
    const insert = [];
    root.forEach((patch, patchIndex) => {
      if (!Array.isArray(patch.insert)) {
        throw importError(
          'IMPORT_SHAPE_ERROR',
          `DSH Profile patch 第 ${patchIndex + 1} 项的 insert 必须是数组`,
        );
      }
      for (const field of Object.keys(patch)) {
        if (field === 'insert') continue;
        addNotice(
          notices,
          'warning',
          'IGNORED_PROFILE_ROOT_FIELD',
          `${patchIndex}.${field}`,
          `已忽略 DSH Profile patch 根字段 ${field}。`,
        );
      }
      insert.push(...patch.insert);
    });
    addNotice(
      notices,
      'repair',
      'PROFILE_SEQUENCE_UNWRAPPED',
      '$',
      '已展开 DSH Profile patch 根数组。',
    );
    root = { insert };
  }
  if (!isObject(root)) {
    throw importError('IMPORT_SHAPE_ERROR', 'MCP 配置根节点必须是对象');
  }
  if (Object.hasOwn(root, 'insert')) {
    if (!Array.isArray(root.insert)) {
      throw importError('IMPORT_SHAPE_ERROR', 'DSH Profile patch 的 insert 必须是数组');
    }
    const entries = [];
    for (const field of Object.keys(root)) {
      if (field === 'insert') continue;
      addNotice(
        notices,
        'warning',
        'IGNORED_PROFILE_ROOT_FIELD',
        field,
        `已忽略 DSH Profile patch 根字段 ${field}。`,
      );
    }
    root.insert.forEach((entry, index) => {
      const path = `insert.${index}`;
      if (!isObject(entry)) {
        addNotice(
          notices,
          'blocking',
          'INVALID_PROFILE_ENTRY',
          path,
          `${path} 必须是对象。`,
        );
        return;
      }
      if (entry.name !== MCP_CLIENT_MODULE) {
        addNotice(
          notices,
          'warning',
          'IGNORED_PROFILE_ENTRY',
          path,
          `已忽略非 ${MCP_CLIENT_MODULE} 的 Profile 条目。`,
        );
        return;
      }
      for (const field of Object.keys(entry)) {
        if (PROFILE_ENTRY_FIELDS.has(field)) continue;
        addNotice(
          notices,
          'blocking',
          'UNKNOWN_PROFILE_FIELD',
          `${path}.${field}`,
          `无法确认 Profile 字段 ${field} 的语义，请手动处理。`,
        );
      }
      const sourceName = String(
        entry.id || entry.config?.serverName || `mcp-server-${index + 1}`,
      );
      entries.push([sourceName, entry.config, `${path}.config`]);
    });
    if (entries.length === 0) {
      throw importError(
        'IMPORT_SHAPE_ERROR',
        `insert 中没有找到 ${MCP_CLIENT_MODULE} 配置`,
      );
    }
    addNotice(
      notices,
      'repair',
      'PROFILE_PATCH_UNWRAPPED',
      'insert',
      '已从 DSH Profile patch 提取 MCP Client 配置。',
    );
    return entries;
  }
  if (Object.hasOwn(root, 'mcpServers')) {
    if (!isObject(root.mcpServers)) {
      throw importError('IMPORT_SHAPE_ERROR', 'mcpServers 必须是对象');
    }
    return Object.entries(root.mcpServers)
      .map(([name, config]) => [name, config, `mcpServers.${name}`]);
  }
  if (looksLikeServer(root)) {
    const name = root.serverName || root.name || root.displayName || 'mcp-server';
    return [[name, root, '$']];
  }
  const entries = Object.entries(root);
  if (entries.length > 0 && entries.every(([, value]) => isObject(value))) {
    return entries.map(([name, config]) => [name, config, `mcpServers.${name}`]);
  }
  throw importError(
    'IMPORT_SHAPE_ERROR',
    '没有找到 MCP Server 配置；请粘贴 mcpServers、带名称的 server 或单个 server 对象',
  );
}

function normalizedServerName(input, used) {
  const candidate = String(input ?? '').trim();
  let base = SERVER_NAME.test(candidate) && !candidate.includes('__')
    ? candidate
    : candidate
      .normalize('NFKD')
      .replace(/[^\x00-\x7F]/gu, '')
      .replace(/[^A-Za-z0-9_-]+/gu, '-')
      .replace(/-{2,}/gu, '-')
      .replace(/_{2,}/gu, '_')
      .replace(/^[-_]+|[-_]+$/gu, '')
      .slice(0, 32)
      .toLowerCase();
  if (!base) base = 'mcp-server';
  let result = base;
  let suffix = 2;
  while (used.has(result.toLowerCase())) {
    const marker = `-${suffix}`;
    result = `${base.slice(0, 32 - marker.length)}${marker}`;
    suffix += 1;
  }
  used.add(result.toLowerCase());
  return result;
}

function addNotice(notices, level, code, path, message) {
  notices.push({ level, code, path, message });
}

function reportSuspiciousControl(value, path, notices) {
  if (typeof value !== 'string' || !/[\u0000-\u001f]/u.test(value)) return;
  addNotice(
    notices,
    'blocking',
    'SUSPICIOUS_PATH_ESCAPE',
    path,
    `${path} 包含控制字符；Windows 路径中的反斜杠可能未正确转义。`,
  );
}

function classifyValue(
  name,
  value,
  path,
  notices,
  secrets,
  { literal = false, secretPath = path } = {},
) {
  if (typeof value !== 'string') {
    addNotice(
      notices,
      'blocking',
      'INVALID_VALUE_TYPE',
      path,
      `${path} 必须是字符串。`,
    );
    return { kind: 'literal', value: String(value ?? '') };
  }
  if (PLACEHOLDER.test(value.trim())) {
    addNotice(
      notices,
      'blocking',
      'CREDENTIAL_REQUIRED',
      path,
      `${path} 是凭据占位符，请填写真实凭据。`,
    );
    return { kind: 'credential' };
  }
  if (!literal || SENSITIVE_NAME.test(name)) {
    secrets[secretPath] = value;
    return { kind: 'credential' };
  }
  return { kind: 'literal', value };
}

function importArgs(value, basePath, notices, secrets) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    addNotice(notices, 'blocking', 'INVALID_ARGS', `${basePath}.args`, 'args 必须是数组。');
    return [];
  }
  return value.map((argument, index) => {
    const path = `args.${index}`;
    const previous = String(value[index - 1] ?? '');
    const text = typeof argument === 'string' ? argument : String(argument ?? '');
    const assignment = text.match(/^(?:--?)?([^=]+)=(.*)$/u);
    const sensitive = SENSITIVE_NAME.test(previous.replace(/^--?/u, ''))
      || /^(?:--header|-H)$/iu.test(previous)
      || (assignment && SENSITIVE_NAME.test(assignment[1]))
      || /(?:authorization\s*:|(?:bearer|basic)\s+\S+)/iu.test(text);
    return classifyValue(
      path,
      argument,
      `${basePath}.${path}`,
      notices,
      secrets,
      { literal: !sensitive, secretPath: path },
    );
  });
}

function importNamedValues(
  value,
  field,
  basePath,
  notices,
  secrets,
  isLiteral,
) {
  if (value === undefined) return [];
  if (!isObject(value)) {
    addNotice(
      notices,
      'blocking',
      'INVALID_NAMED_VALUES',
      `${basePath}.${field}`,
      `${field} 必须是对象。`,
    );
    return [];
  }
  return Object.entries(value).map(([name, item]) => {
    const path = `${field}.${name}`;
    return {
      name,
      value: classifyValue(
        name,
        item,
        `${basePath}.${path}`,
        notices,
        secrets,
        { literal: isLiteral(name), secretPath: path },
      ),
    };
  });
}

function importReconnect(value, basePath, notices) {
  if (value === undefined) return { ...DEFAULT_RECONNECT };
  if (!isObject(value)) {
    addNotice(
      notices,
      'blocking',
      'INVALID_RECONNECT',
      `${basePath}.reconnect`,
      'reconnect 必须是对象。',
    );
    return { ...DEFAULT_RECONNECT };
  }
  return { ...DEFAULT_RECONNECT, ...value };
}

function reportUnknownFields(config, allowed, basePath, notices) {
  for (const field of Object.keys(config)) {
    if (allowed.has(field)) {
      if (METADATA_FIELDS.has(field)) {
        addNotice(
          notices,
          'warning',
          'IGNORED_METADATA',
          `${basePath}.${field}`,
          `已忽略第三方元数据字段 ${field}。`,
        );
      }
      continue;
    }
    addNotice(
      notices,
      'blocking',
      'UNKNOWN_LAUNCH_FIELD',
      `${basePath}.${field}`,
      `无法确认字段 ${field} 是否影响启动，请手动处理。`,
    );
  }
}

function importEntry(sourceName, config, id, serverName, notices, basePath) {
  if (!isObject(config)) {
    addNotice(notices, 'blocking', 'INVALID_SERVER', basePath, `${basePath} 必须是对象。`);
    config = {};
  }
  const secrets = {};
  const declaredTransport = config.transport ?? config.type;
  if (declaredTransport === 'sse') {
    addNotice(
      notices,
      'blocking',
      'UNSUPPORTED_TRANSPORT',
      `${basePath}.type`,
      '当前仅支持 stdio 和 Streamable HTTP，不支持 SSE。',
    );
  } else if (
    declaredTransport !== undefined
    && !['http', 'stdio', 'streamable-http'].includes(declaredTransport)
  ) {
    addNotice(
      notices,
      'blocking',
      'UNSUPPORTED_TRANSPORT',
      `${basePath}.type`,
      `不支持传输类型 ${declaredTransport}。`,
    );
  }
  const useHttp = Object.hasOwn(config, 'url')
    || ['http', 'streamable-http', 'sse'].includes(declaredTransport);
  const common = {
    id,
    displayName: String(config.displayName || config.name || sourceName),
    serverName,
    enabled: false,
    toolCallTimeoutMs: Number(config.toolCallTimeoutMs ?? config.timeout ?? 60_000),
    reconnect: importReconnect(config.reconnect, basePath, notices),
  };
  let instance;
  if (useHttp) {
    reportUnknownFields(config, HTTP_FIELDS, basePath, notices);
    const headers = importNamedValues(
      config.headers,
      'headers',
      basePath,
      notices,
      secrets,
      (name) => SAFE_LITERAL_HEADERS.has(name.toLowerCase()),
    );
    instance = {
      ...common,
      transport: 'streamable-http',
      url: typeof config.url === 'string' ? config.url : '',
      headers,
    };
    if (!instance.url) {
      addNotice(notices, 'blocking', 'REQUIRED_FIELD', `${basePath}.url`, 'url 为必填项。');
    }
    if (
      instance.url.startsWith('http://')
      && headers.some((row) => row.value.kind === 'credential')
    ) {
      addNotice(
        notices,
        'blocking',
        'INSECURE_CREDENTIAL_TRANSPORT',
        `${basePath}.url`,
        '明文 HTTP 不能携带凭据，请改用 HTTPS。',
      );
    }
  } else {
    reportUnknownFields(config, STDIO_FIELDS, basePath, notices);
    instance = {
      ...common,
      transport: 'stdio',
      command: typeof config.command === 'string' ? config.command : '',
      args: importArgs(config.args, basePath, notices, secrets),
      cwd: typeof config.cwd === 'string' ? config.cwd : '',
      env: importNamedValues(
        config.env,
        'env',
        basePath,
        notices,
        secrets,
        (name) => !SENSITIVE_NAME.test(name),
      ),
    };
    if (!instance.command) {
      addNotice(
        notices,
        'blocking',
        'REQUIRED_FIELD',
        `${basePath}.command`,
        'command 为必填项。',
      );
    }
    reportSuspiciousControl(config.command, `${basePath}.command`, notices);
    reportSuspiciousControl(config.cwd, `${basePath}.cwd`, notices);
    if (Array.isArray(config.args)) {
      config.args.forEach((argument, index) =>
        reportSuspiciousControl(argument, `${basePath}.args.${index}`, notices));
    }
  }
  return { sourceName, instance, secrets };
}

export function parseMcpImport(input, { idFactory = randomUUID } = {}) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw importError('IMPORT_PARSE_ERROR', '请粘贴 MCP Server 配置');
  }
  if (input.length > MAX_IMPORT_CHARS) {
    throw importError(
      'IMPORT_TOO_LARGE',
      `粘贴配置不得超过 ${MAX_IMPORT_CHARS} 个字符`,
    );
  }
  const notices = [];
  const root = parseJsonc(input, notices);
  const usedNames = new Set();
  const sourceEntries = serverEntries(root, notices);
  if (sourceEntries.length > MAX_IMPORT_SERVERS) {
    throw importError(
      'IMPORT_TOO_LARGE',
      `一次最多导入 ${MAX_IMPORT_SERVERS} 个 MCP Server`,
    );
  }
  const entries = sourceEntries.map(([sourceName, config, basePath]) => {
    const serverName = normalizedServerName(
      config?.serverName || sourceName,
      usedNames,
    );
    if (serverName !== (config?.serverName || sourceName)) {
      addNotice(
        notices,
        'repair',
        'SERVER_NAME_NORMALIZED',
        `${basePath}.serverName`,
        `server name 已规范化为 ${serverName}。`,
      );
    }
    return importEntry(sourceName, config, idFactory(), serverName, notices, basePath);
  });
  return { entries, notices };
}
