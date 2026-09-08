import {
  spawn,
} from 'node:child_process';

const OUTPUT_LIMIT = 64 * 1_024;

function appendBounded(current, chunk) {
  const next = current + chunk;
  return next.length <= OUTPUT_LIMIT
    ? next
    : next.slice(next.length - OUTPUT_LIMIT);
}

function terminateTree(child, platform) {
  if (!child.pid) return;
  if (platform === 'win32') {
    const killer = spawn(
      'taskkill',
      ['/pid', String(child.pid), '/t', '/f'],
      { windowsHide: true, stdio: 'ignore' },
    );
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

export function runProcess({
  file,
  args,
  cwd,
  env = process.env,
  timeoutMs = 5 * 60_000,
  platform = process.platform,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      env,
      detached: platform !== 'win32',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      terminateTree(child, platform);
    }, timeoutMs);

    child.once('error', (error) => {
      clearTimeout(timer);
      error.code ||= 'PROCESS_START_FAILED';
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        const error = new Error('plugin-manager: 插件操作超过五分钟，已终止进程');
        error.code = 'PROCESS_TIMEOUT';
        error.details = { stdout, stderr };
        reject(error);
        return;
      }
      if (code !== 0) {
        const summary = stderr.trim() || stdout.trim() || `exit ${code ?? signal}`;
        const error = new Error(`plugin-manager: CLI 执行失败：${summary}`);
        error.code = 'PROCESS_FAILED';
        error.details = { code, signal, stdout, stderr };
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
