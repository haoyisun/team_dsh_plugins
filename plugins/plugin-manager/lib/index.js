import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Schema from '@deepseek-ai/schemastery';

import { PluginManagerController } from './controller.js';
import { isExactSemver, isPackageName, validateRegistryUrl } from './model.js';
import { runProcess } from './process.js';
import { ProfilePluginService } from './service.js';

const name = 'plugin-manager';
const inject = ['settings', 'connection', 'webServer'];
const Config = Schema.object({});
const SettingsConfig = Schema.object({
  rollback: Schema.dict(Schema.string()).default({}),
  registryUrl: Schema.string().default(''),
});

function validateSettings(value) {
  for (const [packageName, version] of Object.entries(value.rollback ?? {})) {
    if (
      !isPackageName(packageName)
      || packageName.startsWith('@team-dsh-plugins/')
      || !isExactSemver(version)
    ) {
      throw new TypeError('plugin-manager: rollback 状态包含无效包名或版本');
    }
  }
  validateRegistryUrl(value.registryUrl ?? '');
}

function repositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

async function apply(ctx) {
  const dshHome = path.resolve(
    process.env.DSH_HOME?.trim() || path.join(homedir(), '.dsh'),
  );
  const settingsScope = ctx.settings.register(name, SettingsConfig, {
    base: { rollback: {}, registryUrl: '' },
    validate: validateSettings,
  });
  const readSettings = () => {
    const value = settingsScope.get();
    return {
      rollback: { ...(value.rollback ?? {}) },
      registryUrl: value.registryUrl ?? '',
    };
  };
  const writeSettings = async (next) => {
    const descriptor = ctx.settings
      .describe({ redactSecrets: true })
      .find((entry) => entry.ns === name);
    if (!descriptor) throw new Error('plugin-manager: settings namespace 不可用');
    await ctx.settings.replace(name, next, descriptor.revision);
  };
  const rollback = {
    read: async () => readSettings().rollback,
    write: async (next) => {
      await writeSettings({
        ...readSettings(),
        rollback: next,
      });
    },
  };
  const registryPrefs = {
    read: async () => readSettings().registryUrl,
    write: async (next) => {
      await writeSettings({
        ...readSettings(),
        registryUrl: next,
      });
    },
  };
  const service = new ProfilePluginService({
    repoRoot: repositoryRoot(),
    dshHome,
    dshBin: process.argv[1],
    runProcess,
    getRegistryUrl: () => registryPrefs.read(),
  });
  const controller = new PluginManagerController({
    service,
    rollback,
    registryPrefs,
  });
  const removeRpc = ctx.connection.rpc.handle(
    '/plugin-manager',
    (endpoint, payload) => controller.handle(endpoint, payload),
  );
  ctx.effect(() => async () => {
    await removeRpc();
  });
}

export {
  apply,
  Config,
  inject,
  name,
  validateSettings,
};
