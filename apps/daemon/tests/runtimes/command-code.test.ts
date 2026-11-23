import { test } from 'vitest';
import {
  assert,
  chmodSync,
  join,
  mkdtempSync,
  requireAgent,
  rmSync,
  tmpdir,
  writeFileSync,
} from './helpers/test-helpers.js';
import { orderCommandCodeModels } from '../../src/runtimes/defs/command-code.js';

test('command-code is registered as an ACP runtime over its CLI binary', () => {
  const def = requireAgent('command-code');

  assert.equal(def.name, 'Command Code');
  assert.equal(def.bin, 'command-code');
  // `cmd` is intentionally absent: on Windows it would resolve to the shell.
  assert.deepEqual(def.fallbackBins, ['commandcode']);
  assert.deepEqual(def.buildArgs('ignored prompt', [], [], {}), ['acp']);
  assert.equal(def.streamFormat, 'acp-json-rpc');
  assert.equal(def.promptViaStdin, undefined);
  assert.equal(def.maxPromptArgBytes, undefined);
  assert.equal(def.supportsImagePaths, true);
  assert.equal(def.mcpDiscovery, 'mature-acp');
  assert.equal(def.externalMcpInjection, 'acp-merge');
});

test('command-code defaults to the DeepSeek V4.1 model family', () => {
  const def = requireAgent('command-code');
  const ids = def.fallbackModels.map((model) => model.id);

  assert.equal(ids[0], 'default');
  assert.equal(ids[1], 'deepseek/deepseek-v4.1-flash');
  assert.ok(ids.includes('deepseek/deepseek-v4-pro'));
});

test('command-code accepts 1.x releases without warning', () => {
  const def = requireAgent('command-code');
  assert.ok(def.versionPolicy);
  assert.equal(def.versionPolicy.supportedVersionPattern?.test('1.93.2'), true);
  assert.equal(def.versionPolicy.supportedVersionPattern?.test('1.150.0'), true);
  assert.equal(def.versionPolicy.supportedVersionPattern?.test('2.0.0'), false);
});

test('orderCommandCodeModels keeps default first and lifts DeepSeek above the rest', () => {
  const ordered = orderCommandCodeModels([
    { id: 'default', label: 'Default (CLI config)' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (claude-sonnet-5-5)' },
    { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
  ]);

  assert.deepEqual(
    ordered.map((model) => model.id),
    [
      'default',
      'deepseek/deepseek-v4.1-flash',
      'deepseek/deepseek-v4-pro',
      'claude-sonnet-5-5',
      'gpt-6-astra',
      'gpt-6-luna',
    ],
  );
});

test('command-code fetchModels reads the live ACP catalog and reorders it', async () => {
  const def = requireAgent('command-code');
  const dir = mkdtempSync(join(tmpdir(), 'od-command-code-models-'));
  try {
    const bin = join(dir, 'command-code');
    writeFileSync(
      bin,
      [
        '#!/bin/sh',
        `printf '%s\\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}'`,
        `printf '%s\\n' '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"s1","configOptions":[{"id":"model","name":"Model","category":"model","type":"select","currentValue":"deepseek/deepseek-v4.1-flash","options":[{"value":"claude-sonnet-5-5","name":"Claude Sonnet 5.5"},{"value":"deepseek/deepseek-v4.1-flash","name":"DeepSeek V4.1 Flash"},{"value":"deepseek/deepseek-v4-pro","name":"DeepSeek V4 Pro"}]}]}}'`,
        'sleep 5',
        '',
      ].join('\n'),
    );
    chmodSync(bin, 0o755);

    assert.ok(def.fetchModels, 'command-code must define fetchModels');
    const models = await def.fetchModels(bin, {});
    assert.ok(models);

    assert.deepEqual(
      models.map((model) => model.id),
      [
        'default',
        'deepseek/deepseek-v4.1-flash',
        'deepseek/deepseek-v4-pro',
        'claude-sonnet-5-5',
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
