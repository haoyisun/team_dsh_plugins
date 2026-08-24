import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function loadClientModule() {
  let definition;
  const previousWindow = globalThis.window;
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value;
      },
    },
  };
  try {
    const file = path.resolve('plugins/message-navigator/lib/client.js');
    await import(`${pathToFileURL(file).href}?test=${Date.now()}-${Math.random()}`);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  assert.ok(definition, 'client artifact must register with the DSH module loader');
  const module = definition.factory(() => ({}));
  return { definition, helpers: module.__test };
}

function snapshot(nodes, order = nodes.map(node => node.key)) {
  const byKey = new Map(nodes.map(node => [node.key, node]));
  return {
    chat: {
      order,
      nodes: { get: key => byKey.get(key) },
    },
  };
}

test('client module uses the full package identity', async () => {
  const { definition, helpers } = await loadClientModule();
  assert.equal(definition.id, '@team-dsh-plugins/message-navigator');
  assert.ok(helpers);
});

test('client plugin registers through the session utility slot', async () => {
  let definition;
  const previousWindow = globalThis.window;
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value;
      },
    },
  };
  try {
    const file = path.resolve('plugins/message-navigator/lib/client.js');
    await import(`${pathToFileURL(file).href}?registration=${Date.now()}-${Math.random()}`);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  const react = {};
  const reactDom = {};
  const plugin = definition.factory(id => (
    id === 'react' ? react : id === 'react-dom' ? reactDom : {}
  ));
  let registration;
  let locale;
  let loaded = 0;
  let busy = false;
  const session = {
    getSnapshot: () => ({
      chat: {
        order: loaded === 0 ? ['new'] : ['old', 'new'],
        nodes: { get: () => undefined },
      },
      hasMore: loaded === 0,
      loadingOlder: busy,
    }),
    async loadOlder() {
      loaded += 1;
    },
  };
  const ctx = {
    effect(setup) {
      setup();
    },
    locale: {
      register(namespace, dictionaries) {
        locale = { namespace, dictionaries };
        return () => {};
      },
    },
    sessions: {
      binding: sessionId => (
        sessionId === 'session-1' ? { session } : undefined
      ),
    },
    slots: {
      inject(name, setup) {
        assert.equal(name, 'conversation.session.header.utilities');
        setup();
      },
      register(options, component) {
        registration = { options, component };
        return () => {};
      },
    },
  };

  plugin.apply(ctx);

  assert.deepEqual(plugin.inject, ['slots', 'sessions', 'locale']);
  assert.equal(locale.namespace, 'messageNavigator');
  assert.equal(locale.dictionaries.zh['rail.label'], '消息导航');
  assert.equal(registration.options.name, 'conversation.session.header.utilities');
  assert.equal(registration.options.id, 'message-navigator');
  assert.equal(registration.options.locale, 'messageNavigator');
  assert.equal(typeof registration.component, 'function');
  const injected = registration.options.inject('session-1');
  assert.equal(await injected.loadOlder(), 'changed');
  busy = true;
  assert.equal(await injected.loadOlder(), 'busy');
  assert.equal(loaded, 1);
});

test('history paging detects an in-place chat node revision', async () => {
  let definition;
  const previousWindow = globalThis.window;
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value;
      },
    },
  };
  try {
    const file = path.resolve('plugins/message-navigator/lib/client.js');
    await import(`${pathToFileURL(file).href}?revision=${Date.now()}-${Math.random()}`);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  let node = { kind: 'user' };
  const session = {
    getSnapshot: () => ({
      chat: {
        order: ['same-key'],
        nodes: { get: () => node },
      },
      hasMore: true,
      loadingOlder: false,
    }),
    async loadOlder() {
      node = { kind: 'steering' };
    },
  };
  const rejectionSession = {
    getSnapshot: session.getSnapshot,
    async loadOlder() {
      throw new Error('history unavailable');
    },
  };
  let registration;
  const plugin = definition.factory(() => ({}));
  plugin.apply({
    effect(setup) {
      setup();
    },
    locale: { register: () => () => {} },
    sessions: {
      binding: sessionId => ({
        session: sessionId === 'rejecting-session' ? rejectionSession : session,
      }),
    },
    slots: {
      inject: (_name, setup) => setup(),
      register(options) {
        registration = options;
        return () => {};
      },
    },
  });

  assert.equal(await registration.inject('session-2').loadOlder(), 'changed');
  assert.equal(await registration.inject('rejecting-session').loadOlder(), 'failed');
});

test('navigation items include only user messages and number primary turns', async () => {
  const { helpers } = await loadClientModule();
  const result = helpers.buildNavigationItems(snapshot([
    {
      key: 'user:1',
      kind: 'user',
      anchorSeq: 1,
      data: {
        seq: 1,
        time: Date.parse('2026-08-24T01:00:00Z'),
        content: [{ type: 'text', text: '第一条提问' }],
      },
    },
    {
      key: 'assistant:2',
      kind: 'assistant-step',
      anchorSeq: 2,
      data: {},
    },
    {
      key: 'steering:3',
      kind: 'steering',
      anchorSeq: 3,
      data: {
        seq: 3,
        time: Date.parse('2026-08-24T01:01:00Z'),
        content: [
          { type: 'text', text: '继续完成' },
          { type: 'image', mimeType: 'image/png' },
        ],
      },
    },
    {
      key: 'user:4',
      kind: 'user',
      anchorSeq: 4,
      data: {
        seq: 4,
        time: Date.parse('2026-08-24T01:02:00Z'),
        content: [{ type: 'text', text: '第二条\n提问' }],
      },
    },
  ]));

  assert.deepEqual(result, [
    {
      key: 'user:1',
      seq: 1,
      time: Date.parse('2026-08-24T01:00:00Z'),
      preview: '第一条提问',
      steering: false,
      turn: 1,
    },
    {
      key: 'steering:3',
      seq: 3,
      time: Date.parse('2026-08-24T01:01:00Z'),
      preview: '继续完成 [图片]',
      steering: true,
      turn: 1,
    },
    {
      key: 'user:4',
      seq: 4,
      time: Date.parse('2026-08-24T01:02:00Z'),
      preview: '第二条 提问',
      steering: false,
      turn: 2,
    },
  ]);
});

test('reading line selects the latest message that crossed 25 percent', async () => {
  const { helpers } = await loadClientModule();
  const rows = [
    { key: 'a', top: 80 },
    { key: 'b', top: 240 },
    { key: 'c', top: 560 },
  ];

  assert.equal(helpers.activeIndexAtReadingLine(rows, 100, 900), 1);
  assert.equal(helpers.activeIndexAtReadingLine(rows, -400, 400), 0);
  assert.equal(helpers.activeIndexAtReadingLine(rows, 1000, 1800), 2);
});

test('wheel movement stays inside the rail and yields at its edges', async () => {
  const { helpers } = await loadClientModule();

  assert.deepEqual(helpers.railWheel(100, 80, 300), { next: 180, consumed: true });
  assert.deepEqual(helpers.railWheel(280, 80, 300), { next: 300, consumed: true });
  assert.deepEqual(helpers.railWheel(300, 80, 300), { next: 300, consumed: false });
  assert.deepEqual(helpers.railWheel(0, -80, 300), { next: 0, consumed: false });
});

test('automatic history loading stops at the event budget', async () => {
  const { helpers } = await loadClientModule();

  assert.equal(helpers.shouldAutoLoad({ loadedEvents: 1_950, hasMore: true, loading: false }), true);
  assert.equal(helpers.shouldAutoLoad({ loadedEvents: 2_000, hasMore: true, loading: false }), false);
  assert.equal(helpers.shouldAutoLoad({ loadedEvents: 100, hasMore: false, loading: false }), false);
  assert.equal(helpers.shouldAutoLoad({ loadedEvents: 100, hasMore: true, loading: true }), false);
});

test('prepend restoration keeps the semantic anchor at the same viewport offset', async () => {
  const { helpers } = await loadClientModule();

  assert.equal(helpers.restoredScrollTop(300, 120, 220), 400);
  assert.equal(helpers.restoredScrollTop(25, 80, 30), 0);
});

test('history loading restores the captured DOM anchor after prepend', async () => {
  const { helpers } = await loadClientModule();
  const calls = [];
  const beforeRow = {
    getBoundingClientRect: () => ({ top: 100, bottom: 140 }),
  };
  const afterRow = {
    getBoundingClientRect: () => ({ top: 260, bottom: 300 }),
  };
  let anchors = new Map([['question-1', beforeRow]]);
  const scrollport = {
    scrollTop: 300,
    scrollHeight: 1_200,
    clientHeight: 500,
    contains: () => true,
    querySelector: () => null,
    getBoundingClientRect: () => ({ top: 0, bottom: 500, left: 0, width: 400 }),
  };

  const result = await helpers.loadPagePreservingPosition({
    scrollport,
    getAnchors: () => anchors,
    loadOlder: async () => {
      calls.push('load');
      return 'changed';
    },
    afterPaint: async () => {
      calls.push('paint');
    },
    refreshAnchors: () => {
      calls.push('refresh');
      anchors = new Map([['question-1', afterRow]]);
    },
    isActive: () => true,
  });

  assert.equal(result, 'changed');
  assert.deepEqual(calls, ['load', 'paint', 'refresh']);
  assert.equal(scrollport.scrollTop, 460);
});
