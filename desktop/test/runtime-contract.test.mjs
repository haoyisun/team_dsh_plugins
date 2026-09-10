import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DshUrlParser,
  classifyListenerProcess,
  desktopNavigationAction,
  dshExecArgs,
  externalHttpUrl,
  isAllowedDshNavigation,
  matchesDshInspection,
  npmExecPowerShellLaunch,
  normalizeProcessInspection,
  RedactedLineStream,
  redactSecrets,
} from '../src/runtime-contract.mjs';

test('DSH URL parser accepts a chunked loopback startup URL', () => {
  const parser = new DshUrlParser();

  assert.equal(parser.push('booting\r\ndsh web: http://127.0.'), undefined);
  assert.equal(
    parser.push('0.1:3080/?token=secret-token\r\nready'),
    'http://127.0.0.1:3080/?token=secret-token',
  );
});

test('DSH URL parser rejects non-loopback and non-http URLs', () => {
  const parser = new DshUrlParser();

  assert.equal(
    parser.push('dsh web: https://example.com:3080/?token=secret\r\n'),
    undefined,
  );
  assert.equal(
    parser.push('dsh web: file:///C:/Users/example/index.html\r\n'),
    undefined,
  );
});

test('diagnostics redact URL tokens and token assignments', () => {
  const diagnostic = [
    'dsh web: http://127.0.0.1:3080/?token=abc123&mode=web',
    'token = another-secret',
  ].join('\n');

  const redacted = redactSecrets(diagnostic);

  assert.doesNotMatch(redacted, /abc123|another-secret/);
  assert.match(redacted, /token=\[REDACTED\]/);
});

test('streaming diagnostics redact tokens split across arbitrary chunks', () => {
  const stream = new RedactedLineStream();

  assert.equal(
    stream.push('dsh web: http://127.0.0.1:3080/?tok'),
    '',
  );
  const output = stream.push('en=split-secret&mode=web\r\nready\r\n');

  assert.doesNotMatch(output, /split-secret/);
  assert.match(output, /token=\[REDACTED\]&mode=web/);
  assert.match(output, /ready/);
});

test('streaming diagnostics drop an overlong unterminated line', () => {
  const stream = new RedactedLineStream({ maxLineLength: 32 });

  const first = stream.push(`token=${'s'.repeat(40)}`);
  const second = stream.push('still-secret\r\nsafe\r\n');

  assert.doesNotMatch(`${first}${second}`, /still-secret/);
  assert.match(`${first}${second}`, /省略过长输出行/);
  assert.match(second, /safe/);
});

test('navigation is limited to the exact DSH origin', () => {
  const origin = 'http://127.0.0.1:3080';

  assert.equal(
    isAllowedDshNavigation('http://127.0.0.1:3080/chat/1', origin),
    true,
  );
  assert.equal(
    isAllowedDshNavigation('http://localhost:3080/chat/1', origin),
    false,
  );
  assert.equal(
    isAllowedDshNavigation('http://127.0.0.1:3081/chat/1', origin),
    false,
  );
  assert.equal(
    isAllowedDshNavigation('https://example.com/', origin),
    false,
  );
});

test('shell and DSH contents use separate navigation capabilities', () => {
  const candidate = 'http://127.0.0.1:3080/chat/1';
  const expectedOrigin = 'http://127.0.0.1:3080';

  assert.equal(desktopNavigationAction({
    candidate,
    current: 'file:///D:/desktop/status/index.html',
    expectedOrigin,
    role: 'shell',
  }), 'external');
  assert.equal(desktopNavigationAction({
    candidate,
    current: 'http://127.0.0.1:3080/',
    expectedOrigin,
    role: 'dsh',
  }), 'allow');
  assert.equal(desktopNavigationAction({
    candidate: 'dsh-desktop://restart',
    current: 'file:///D:/desktop/status/index.html',
    expectedOrigin,
    role: 'shell',
  }), 'desktop-action');
});

test('external navigation only opens bounded HTTP URLs', () => {
  assert.equal(
    externalHttpUrl('https://example.com/docs'),
    'https://example.com/docs',
  );
  assert.equal(externalHttpUrl('file:///C:/Windows/System32/calc.exe'), undefined);
  assert.equal(externalHttpUrl('custom-protocol://run'), undefined);
  assert.equal(
    externalHttpUrl('https://example.com/?token=desktop-secret'),
    undefined,
  );
  assert.equal(
    externalHttpUrl(`https://example.com/${'a'.repeat(2082)}`),
    undefined,
  );
});

test('listener classification accepts the official DSH Node entry point', () => {
  const result = classifyListenerProcess(42, [
    {
      pid: 10,
      parentPid: 1,
      name: 'powershell.exe',
      commandLine: 'powershell.exe',
      creationTime: '2026-09-08T01:00:00.000Z',
    },
    {
      pid: 20,
      parentPid: 10,
      name: 'cmd.exe',
      commandLine: 'cmd.exe /c npx @deepseek-ai/dsh web',
      creationTime: '2026-09-08T01:01:00.000Z',
    },
    {
      pid: 30,
      parentPid: 20,
      name: 'node.exe',
      commandLine: 'node npm-cli.js exec @deepseek-ai/dsh web',
      creationTime: '2026-09-08T01:02:00.000Z',
    },
    {
      pid: 42,
      parentPid: 30,
      name: 'node.exe',
      commandLine: '"node" "C:\\cache\\@deepseek-ai\\dsh\\lib\\bin.js" web',
      creationTime: '2026-09-08T01:03:00.000Z',
    },
  ]);

  assert.deepEqual(result, {
    kind: 'dsh',
    listenerPid: 42,
    listenerCreationTime: '2026-09-08T01:03:00.000Z',
    rootPid: 42,
    commandLine: '"node" "C:\\cache\\@deepseek-ai\\dsh\\lib\\bin.js" web',
    rootCommandLine: '"node" "C:\\cache\\@deepseek-ai\\dsh\\lib\\bin.js" web',
  });
});

test('listener classification refuses unknown port owners', () => {
  assert.deepEqual(
    classifyListenerProcess(51, [
      {
        pid: 51,
        parentPid: 10,
        name: 'node.exe',
        commandLine: 'node local-server.js --port 3080',
        creationTime: '2026-09-08T01:03:00.000Z',
      },
    ]),
    {
      kind: 'unknown',
      listenerPid: 51,
      commandLine: 'node local-server.js --port 3080',
    },
  );
});

test('listener classification rejects commands that only mention DSH markers', () => {
  assert.equal(
    classifyListenerProcess(51, [
      {
        pid: 51,
        parentPid: 10,
        name: 'node.exe',
        commandLine: 'node unrelated-server.js --docs @deepseek-ai/dsh --view web',
        creationTime: '2026-09-08T01:03:00.000Z',
      },
    ]).kind,
    'unknown',
  );
});

test('DSH launches always bind an exact version', () => {
  assert.deepEqual(dshExecArgs('1.2.3'), [
    '--yes',
    '@deepseek-ai/dsh@1.2.3',
    'web',
    '--no-open',
  ]);
  assert.deepEqual(dshExecArgs('2.0.0-beta.1'), [
    '--yes',
    '@deepseek-ai/dsh@2.0.0-beta.1',
    'web',
    '--no-open',
  ]);
  for (const invalid of ['latest', '^1.2.3', '../dsh', 'https://example.com/dsh']) {
    assert.throws(() => dshExecArgs(invalid), /精确 semver/u);
  }
});

test('npm exec launch keeps the selected npm shim and exact version', () => {
  assert.deepEqual(
    npmExecPowerShellLaunch({
      version: '1.2.3',
      npmCommand: 'C:\\Volta\\bin\\npm.cmd',
      powershellExecutable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      runnerScript: 'D:\\repo\\desktop\\scripts\\run-npx.ps1',
    }),
    {
      executable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        'D:\\repo\\desktop\\scripts\\run-npx.ps1',
        'C:\\Volta\\bin\\npm.cmd',
        '1.2.3',
        'prefer-offline',
      ],
    },
  );
});

test('npm exec launch can require fresh registry metadata', () => {
  assert.deepEqual(
    npmExecPowerShellLaunch({
      version: '1.2.3',
      cacheMode: 'prefer-online',
      npmCommand: 'C:\\Volta\\bin\\npm.cmd',
      powershellExecutable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      runnerScript: 'D:\\repo\\desktop\\scripts\\run-npx.ps1',
    }).args.slice(-2),
    ['1.2.3', 'prefer-online'],
  );
  assert.throws(
    () => npmExecPowerShellLaunch({
      version: '1.2.3',
      cacheMode: 'prefer-sometimes',
      npmCommand: 'C:\\Volta\\bin\\npm.cmd',
      powershellExecutable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      runnerScript: 'D:\\repo\\desktop\\scripts\\run-npx.ps1',
    }),
    /元数据模式/u,
  );
});

test('process inspection normalizes CIM numeric strings', () => {
  assert.deepEqual(
    normalizeProcessInspection({
      listenerPid: '42',
      processes: [
        {
          pid: '42',
          parentPid: '20',
          name: 'node.exe',
          commandLine: 'node dsh.js web',
          creationTime: '2026-09-08T01:03:00.000Z',
        },
      ],
    }),
    {
      listenerPid: 42,
      processes: [
        {
          pid: 42,
          parentPid: 20,
          name: 'node.exe',
          commandLine: 'node dsh.js web',
          creationTime: '2026-09-08T01:03:00.000Z',
        },
      ],
    },
  );
});

test('process inspection rejects malformed listener data', () => {
  assert.throws(
    () => normalizeProcessInspection({ listenerPid: 'oops', processes: [] }),
    /监听进程/,
  );
});

test('process termination requires a fresh matching DSH inspection', () => {
  const expected = {
    kind: 'dsh',
    port: 3080,
    listenerPid: 42,
    rootPid: 20,
    rootCommandLine: 'npx @deepseek-ai/dsh web',
    listenerCreationTime: '2026-09-08T01:03:00.000Z',
  };

  assert.equal(matchesDshInspection(expected, { ...expected }), true);
  assert.equal(
    matchesDshInspection(expected, {
      ...expected,
      rootCommandLine: 'node unrelated-server.js',
    }),
    false,
  );
  assert.equal(
    matchesDshInspection(expected, { kind: 'free', port: 3080 }),
    false,
  );
});
