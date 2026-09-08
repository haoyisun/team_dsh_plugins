import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Schema from '@deepseek-ai/schemastery';

import { PluginManagerController } from './controller.js';
import { isExactSemver, isPackageName } from './model.js';
import { runProcess } from './process.js';
import { ProfilePluginService } from './service.js';

const name = 'plugin-manager';
const inject = ['settings', 'connection'];
const Config = Schema.object({});
const SettingsConfig = Schema.object({
  rollback: Schema.dict(Schema.string()).default({}),
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
}

function repositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

async function apply(ctx) {
  const dshHome = path.resolve(
    process.env.DSH_HOME?.trim() || path.join(homedir(), '.dsh'),
  );
  const settingsScope = ctx.settings.register(name, SettingsConfig, {
    base: { rollback: {} },
    validate: validateSettings,
  });
  const rollback = {
    read: async () => ({ ...settingsScope.get().rollback }),
    write: async (next) => {
      const descriptor = ctx.settings
        .describe({ redactSecrets: true })
        .find((entry) => entry.ns === name);
      if (!descriptor) throw new Error('plugin-manager: settings namespace 不可用');
      await ctx.settings.replace(name, { rollback: next }, descriptor.revision);
    },
  };
  const service = new ProfilePluginService({
    repoRoot: repositoryRoot(),
    dshHome,
    dshBin: process.argv[1],
    runProcess,
  });
  const controller = new PluginManagerController({
    service,
    rollback,
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
