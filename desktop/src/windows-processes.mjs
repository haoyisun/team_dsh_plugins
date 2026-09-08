import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import {
  classifyListenerProcess,
  matchesDshInspection,
  normalizeProcessInspection,
} from './runtime-contract.mjs';

const execFileAsync = promisify(execFile);
const POWERSHELL = 'powershell.exe';

function encodedPowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

async function inspectListener(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError('端口无效');
  }

  const script = `
$ErrorActionPreference = 'Stop'
$listener = Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $listener) {
  [pscustomobject]@{ listenerPid = $null; processes = @() } | ConvertTo-Json -Compress
  exit 0
}
$items = @()
$currentPid = [int]$listener.OwningProcess
$seen = @{}
while ($currentPid -gt 0 -and -not $seen.ContainsKey($currentPid)) {
  $seen[$currentPid] = $true
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $currentPid" -ErrorAction SilentlyContinue
  if ($null -eq $process) { break }
  $items += [pscustomobject]@{
    pid = [int]$process.ProcessId
    parentPid = [int]$process.ParentProcessId
    name = [string]$process.Name
    commandLine = [string]$process.CommandLine
    creationTime = $process.CreationDate.ToUniversalTime().ToString('o')
  }
  $currentPid = [int]$process.ParentProcessId
}
[pscustomobject]@{
  listenerPid = [int]$listener.OwningProcess
  processes = @($items)
} | ConvertTo-Json -Compress -Depth 4
`;

  const { stdout } = await execFileAsync(
    POWERSHELL,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      encodedPowerShell(script),
    ],
    {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 512 * 1024,
    },
  );
  return normalizeProcessInspection(JSON.parse(stdout.trim()));
}

export async function inspectDshPort(port = 3080) {
  const inspection = await inspectListener(port);
  if (inspection.listenerPid === null) return { kind: 'free', port };
  return {
    port,
    ...classifyListenerProcess(
      inspection.listenerPid,
      inspection.processes,
    ),
  };
}

export async function terminateDshProcessTree(inspection) {
  if (inspection?.kind !== 'dsh' || !Number.isInteger(inspection.rootPid)) {
    throw new TypeError('拒绝终止未经确认的进程');
  }
  const current = await inspectDshPort(inspection.port);
  if (!matchesDshInspection(inspection, current)) {
    throw new Error('DSH 进程在确认期间发生变化，已取消终止');
  }
  await execFileAsync(
    'taskkill.exe',
    ['/PID', String(inspection.rootPid), '/T', '/F'],
    { windowsHide: true, timeout: 10_000 },
  );
}

export async function waitForPortFree(port = 3080, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await inspectDshPort(port)).kind === 'free') return;
    await delay(150);
  }
  throw new Error(`等待 127.0.0.1:${port} 释放超时`);
}
