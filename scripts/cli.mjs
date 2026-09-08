#!/usr/bin/env node

import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  dshVersionProbe,
  doctorWorkspace,
  initWorkspace,
  unlinkWorkspace,
  validateWorkspace,
} from './workspace.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuredHome = process.env.DSH_HOME?.trim();
const dshHome = path.resolve(configuredHome || path.join(os.homedir(), '.dsh'));

function report(result) {
  for (const warning of result.warnings) console.warn(`WARN  ${warning}`);
  for (const error of result.errors) console.error(`ERROR ${error}`);
  if (result.errors.length > 0) process.exitCode = 1;
}

async function detectDshVersion() {
  const probe = dshVersionProbe();
  try {
    const { stdout } = await execFileAsync(
      probe.file,
      probe.args,
      { timeout: 30_000 },
    );
    const parsed = JSON.parse(stdout);
    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function requireValidWorkspace() {
  const result = await validateWorkspace({ repoRoot });
  report(result);
  if (result.errors.length > 0) throw new Error('仓库校验失败');
}

const command = process.argv[2];

try {
  if (command === 'init') {
    await requireValidWorkspace();
    await initWorkspace({ repoRoot, dshHome });
    console.log(`已接入 DSH Home：${dshHome}`);
  } else if (command === 'doctor') {
    const result = await doctorWorkspace({
      repoRoot,
      dshHome,
      dshVersion: await detectDshVersion(),
    });
    report(result);
    if (result.errors.length === 0) console.log('DSH 插件工作区状态正常。');
  } else if (command === 'unlink') {
    await unlinkWorkspace({ repoRoot, dshHome });
    console.log('已移除仓库接入；插件设置和数据保持不变。');
  } else if (command === 'validate') {
    report(await validateWorkspace({ repoRoot }));
  } else {
    console.error(
      '用法：node scripts/cli.mjs <init|doctor|unlink|validate>',
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`ERROR ${error.message}`);
  process.exitCode = 1;
}
