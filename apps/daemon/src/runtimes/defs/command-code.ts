import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

// Command Code speaks ACP over stdio (`command-code acp`). The CLI ships with
// DeepSeek V4.1 Flash as its default model, and `session/new` reports the
// account's live catalog as a `model` config option, so OpenDesign gets model
// discovery, `session/set_config_option` selection, streamed text/tool updates
// and standard `session/request_permission` approvals without a bespoke
// transport.
const PREFERRED_COMMAND_CODE_MODEL_IDS = [
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
] as const;

const PREFERRED_COMMAND_CODE_MODEL_RANK: ReadonlyMap<string, number> = new Map(
  PREFERRED_COMMAND_CODE_MODEL_IDS.map((id, index) => [id, index]),
);

/**
 * Keep the synthetic `default` option first, then the DeepSeek family the CLI
 * already treats as its default before the rest of the catalog. The catalog
 * itself lists Claude/GPT models ahead of DeepSeek, which would otherwise hide
 * the model this adapter is set up for at the bottom of a ~100-entry picker.
 */
export function orderCommandCodeModels(
  models: RuntimeModelOption[],
): RuntimeModelOption[] {
  const defaultOptions = models.filter((model) => model.id === DEFAULT_MODEL_OPTION.id);
  const rest = models.filter((model) => model.id !== DEFAULT_MODEL_OPTION.id);
  return [
    ...defaultOptions,
    ...rest
      .map((model, index) => ({ model, index }))
      .sort((a, b) => {
        const aRank =
          PREFERRED_COMMAND_CODE_MODEL_RANK.get(a.model.id) ?? Number.MAX_SAFE_INTEGER;
        const bRank =
          PREFERRED_COMMAND_CODE_MODEL_RANK.get(b.model.id) ?? Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) return aRank - bRank;
        return a.index - b.index;
      })
      .map(({ model }) => model),
  ];
}

export const commandCodeAgentDef = {
  id: 'command-code',
  name: 'Command Code',
  // The CLI installs four bin aliases (`command-code`, `commandcode`, `cmd`,
  // `cmdc`). `cmd` is deliberately absent: on Windows it resolves to
  // `C:\Windows\System32\cmd.exe`, which would probe the shell instead of the
  // agent.
  bin: 'command-code',
  fallbackBins: ['commandcode'],
  versionArgs: ['--version'],
  versionPolicy: {
    supportedVersions: ['1.93.2'],
    supportedVersionPattern: /^1\.\d+\.\d+$/u,
    requireVersion: true,
  },
  fetchModels: async (resolvedBin, env) =>
    orderCommandCodeModels(
      await detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 20_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    ),
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    {
      id: 'deepseek/deepseek-v4.1-flash',
      label: 'DeepSeek V4.1 Flash (deepseek/deepseek-v4.1-flash)',
    },
    {
      id: 'deepseek/deepseek-v4-pro',
      label: 'DeepSeek V4 Pro (deepseek/deepseek-v4-pro)',
    },
    {
      id: 'deepseek/deepseek-v4-flash',
      label: 'DeepSeek V4 Flash (deepseek/deepseek-v4-flash)',
    },
  ],
  buildArgs: () => ['acp'],
  streamFormat: 'acp-json-rpc',
  // The ACP handshake advertises `model` as a select config option, so a
  // free-text id has nothing to validate against; the picker surfaces the live
  // catalog instead.
  supportsCustomModel: false,
  supportsImagePaths: true,
  mcpDiscovery: 'mature-acp',
  externalMcpInjection: 'acp-merge',
  installUrl: 'https://www.npmjs.com/package/command-code',
  docsUrl: 'https://commandcode.ai/docs',
} satisfies RuntimeAgentDef;
