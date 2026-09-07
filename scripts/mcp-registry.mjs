import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client';
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/u;
const ENTRY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const ENV_EXPRESSION = /^process\.env\.[A-Z][A-Z0-9_]*$/u;
const ABSOLUTE_PATH = /(?:^|=)(?:[A-Za-z]:[\\/]|[\\/])/u;
const SENSITIVE_NAME =
  /(?:auth|token|secret|password|credential|api[-_]?key|access[-_]?key|private[-_]?key)/iu;
class EnvironmentExpression {
  constructor(source) {
    this.__jsExpr = source;
  }
}
const jsExpressionTag = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (source) => new EnvironmentExpression(source),
};

function registryPath(repoRoot) {
  return path.join(repoRoot, 'profiles', 'web.mcp.yml');
}

function isExpression(value) {
  return value instanceof EnvironmentExpression;
}

function rejectUnknownKeys(value, allowed, label, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} 不支持字段 ${key}`);
  }
}

function validateValue(value, label, errors, { rejectAbsolutePath = false } = {}) {
  if (isExpression(value)) {
    if (!ENV_EXPRESSION.test(value.__jsExpr)) {
      errors.push(`${label} 的 !!js 仅允许读取环境变量 process.env.NAME`);
    }
    return;
  }
  if (value && typeof value === 'object' && '__jsExpr' in value) {
    errors.push(`${label} 必须使用 !!js，且仅允许读取环境变量 process.env.NAME`);
    return;
  }
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${label} 必须是非空字符串或环境变量表达式`);
  } else if (rejectAbsolutePath && ABSOLUTE_PATH.test(value)) {
    errors.push(`${label} 不得包含本机绝对路径，请改用环境变量表达式`);
  }
}

function validateOptionalSettings(config, label, errors) {
  if (
    config.toolCallTimeoutMs !== undefined
    && (typeof config.toolCallTimeoutMs !== 'number'
      || !Number.isFinite(config.toolCallTimeoutMs)
      || config.toolCallTimeoutMs <= 0)
  ) {
    errors.push(`${label} 的 toolCallTimeoutMs 必须是正数`);
  }
  if (
    config.failOnStartupError !== undefined
    && typeof config.failOnStartupError !== 'boolean'
  ) {
    errors.push(`${label} 的 failOnStartupError 必须是布尔值`);
  }
  if (config.reconnect === undefined) return;
  if (!config.reconnect || typeof config.reconnect !== 'object' || Array.isArray(config.reconnect)) {
    errors.push(`${label} 的 reconnect 必须是对象`);
    return;
  }
  rejectUnknownKeys(
    config.reconnect,
    new Set(['enabled', 'initialDelayMs', 'maxDelayMs', 'maxAttempts']),
    `${label} 的 reconnect`,
    errors,
  );
  if (
    config.reconnect.enabled !== undefined
    && typeof config.reconnect.enabled !== 'boolean'
  ) {
    errors.push(`${label} 的 reconnect.enabled 必须是布尔值`);
  }
  for (const key of ['initialDelayMs', 'maxDelayMs', 'maxAttempts']) {
    const value = config.reconnect[key];
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
      errors.push(`${label} 的 reconnect.${key} 必须是正整数`);
    }
  }
}

function validateSecretMap(value, label, errors, keyPattern) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} 必须是对象`);
    return;
  }
  for (const [name, secret] of Object.entries(value)) {
    if (!keyPattern.test(name)) {
      errors.push(`${label} 键名无效：${name}`);
    }
    if (!isExpression(secret)) {
      errors.push(`${label} ${name} 必须使用环境变量表达式`);
    } else {
      validateValue(secret, `${label} ${name}`, errors);
    }
  }
}

function validateStdioArgs(args, label, errors) {
  if (args !== undefined && !Array.isArray(args)) {
    errors.push(`${label} 的 args 必须是数组`);
    return;
  }
  for (const [index, argument] of (args ?? []).entries()) {
    validateValue(argument, `${label} 的 args[${index}]`, errors, {
      rejectAbsolutePath: true,
    });
    if (typeof argument !== 'string') continue;
    const option = argument.match(/^(?:--?|\/)(?<name>[^=:]+)(?:(?<separator>[=:])(?<value>.*))?$/u);
    if (!option?.groups || !SENSITIVE_NAME.test(option.groups.name)) continue;
    if (option.groups.separator && option.groups.value) {
      errors.push(`${label} 的敏感参数不得包含明文值，请使用独立的环境变量表达式`);
    } else if (!isExpression(args[index + 1])) {
      errors.push(`${label} 的敏感参数值必须使用环境变量表达式`);
    }
  }
}

export async function readMcpRegistry({ repoRoot }) {
  const entries = parse(
    await readFile(registryPath(repoRoot), 'utf8'),
    { customTags: [jsExpressionTag] },
  );
  if (!Array.isArray(entries)) {
    throw new TypeError('profiles/web.mcp.yml 必须是 MCP entry 数组');
  }
  return entries;
}

export function validateMcpRegistry(entries) {
  const errors = [];
  const ids = new Set();
  const serverNames = new Set();
  if (!Array.isArray(entries)) {
    return { errors: ['profiles/web.mcp.yml 必须是 MCP entry 数组'], warnings: [] };
  }

  for (const [index, entry] of entries.entries()) {
    const label = `MCP 条目 ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label} 必须是对象`);
      continue;
    }
    rejectUnknownKeys(
      entry,
      new Set(['id', 'name', 'disabled', 'config']),
      label,
      errors,
    );
    if (typeof entry.id !== 'string' || !ENTRY_ID.test(entry.id)) {
      errors.push(`${label} 必须包含稳定的字符串 id`);
    } else {
      if (ids.has(entry.id)) errors.push(`重复的 MCP entry id：${entry.id}`);
      ids.add(entry.id);
    }
    if (entry.name !== MCP_CLIENT) {
      errors.push(`${label} 的 name 必须是 ${MCP_CLIENT}`);
    }
    if (entry.disabled !== undefined && typeof entry.disabled !== 'boolean') {
      errors.push(`${label} 的 disabled 必须是布尔值`);
    }

    const config = entry.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      errors.push(`${label} 必须包含 config 对象`);
      continue;
    }
    if (typeof config.serverName !== 'string' || !SERVER_NAME.test(config.serverName)) {
      errors.push(`${label} 的 serverName 必须匹配 [A-Za-z0-9_-]{1,32}`);
    } else {
      if (serverNames.has(config.serverName)) {
        errors.push(`重复的 MCP serverName：${config.serverName}`);
      }
      serverNames.add(config.serverName);
    }

    if (config.transport === 'stdio') {
      rejectUnknownKeys(
        config,
        new Set([
          'transport',
          'serverName',
          'command',
          'args',
          'env',
          'cwd',
          'toolCallTimeoutMs',
          'failOnStartupError',
          'reconnect',
        ]),
        `${label} 的 config`,
        errors,
      );
      validateValue(config.command, `${label} 的 command`, errors, {
        rejectAbsolutePath: true,
      });
      validateStdioArgs(config.args, label, errors);
      if (config.cwd !== undefined) {
        validateValue(config.cwd, `${label} 的 cwd`, errors, {
          rejectAbsolutePath: true,
        });
      }
      validateSecretMap(
        config.env,
        `${label} 的 env`,
        errors,
        /^[A-Za-z_][A-Za-z0-9_]*$/u,
      );
    } else if (config.transport === 'streamable-http') {
      rejectUnknownKeys(
        config,
        new Set([
          'transport',
          'serverName',
          'url',
          'headers',
          'toolCallTimeoutMs',
          'failOnStartupError',
          'reconnect',
        ]),
        `${label} 的 config`,
        errors,
      );
      validateValue(config.url, `${label} 的 url`, errors);
      if (!isExpression(config.url) && typeof config.url === 'string') {
        try {
          const url = new URL(config.url);
          if (!['http:', 'https:'].includes(url.protocol)) {
            errors.push(`${label} 的 URL 必须使用 http 或 https`);
          }
          if (url.username || url.password) {
            errors.push(`${label} 的 URL 不得内嵌凭据`);
          }
          for (const key of url.searchParams.keys()) {
            if (SENSITIVE_NAME.test(key)) {
              errors.push(`${label} 的 URL 查询参数不得包含敏感值：${key}`);
            }
          }
        } catch {
          errors.push(`${label} 的 URL 无效`);
        }
      }
      validateSecretMap(
        config.headers,
        `${label} 的 header`,
        errors,
        /^[A-Za-z][A-Za-z0-9_-]*$/u,
      );
    } else {
      errors.push(`${label} 的 transport 必须是 stdio 或 streamable-http`);
    }
    validateOptionalSettings(config, label, errors);
  }
  return { errors, warnings: [] };
}

export const mcpRegistryPaths = { registryPath };
