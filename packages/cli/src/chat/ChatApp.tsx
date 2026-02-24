import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Static, useApp, useInput } from 'ink';
import type { MCPClientManager } from '@scrutari/mcp';
import type { SkillSummary, AgentSkillSummary, HookManager } from '@scrutari/core';
import { loadSkillFile, estimatePipelineCost, scanSkillFiles } from '@scrutari/core';
import type { Config } from '../config/index.js';
import type { ContextBundle } from '../context/types.js';
import { findPersona, loadAllPersonas } from '../context/personas.js';
import { saveMemory, recordTickerMention, recordAnalysis } from '../context/memory.js';
import type { UserMemory } from '../context/types.js';
import type { SessionSummary } from './session/types.js';
import type { ChatMessage } from './types.js';
import { WelcomeBanner } from './components/WelcomeBanner.js';
import { MessageItem } from './components/MessageList.js';
import { InputPrompt } from './components/InputPrompt.js';
import { ApprovalPrompt } from './components/ApprovalPrompt.js';
import { ToolPermissionPrompt } from './components/ToolPermissionPrompt.js';
import { SkillBrowser, type SkillDetail } from './components/SkillBrowser.js';
import { ToolBrowser, type BuiltInToolGroup, type BuiltInMcpServer } from './components/ToolBrowser.js';
import { useSession } from './hooks/useSession.js';
import { useOrchestrator } from './hooks/useOrchestrator.js';
import { useCompaction } from './hooks/useCompaction.js';
import { ContextUsageBar } from './components/ContextUsageBar.js';
import { BudgetDisplay } from './components/BudgetDisplay.js';
import { estimateTokens } from '@scrutari/core';
import { parseSlashCommand, getCommandList } from './commands.js';
import { parseSkillCommand, buildSkillMessage } from './skill-command.js';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

interface ChatAppProps {
  config: Config;
  version: string;
  cwd: string;
  continueSession?: boolean;
  resumeId?: string;
  verbose?: boolean;
  dryRun?: boolean;
  readOnly?: boolean;
  skillNames: string[];
  skillSummaries?: SkillSummary[];
  agentSkillSummaries?: AgentSkillSummary[];
  recentSessions: SessionSummary[];
  mcpClient?: MCPClientManager;
  contextBundle?: ContextBundle;
  hookManager?: HookManager;
}

export function ChatApp({
  config,
  version,
  cwd,
  continueSession,
  resumeId,
  verbose,
  dryRun: initialDryRun,
  readOnly: initialReadOnly,
  skillNames,
  skillSummaries,
  agentSkillSummaries,
  recentSessions,
  mcpClient,
  contextBundle: initialContextBundle,
  hookManager,
}: ChatAppProps): React.ReactElement {
  const { exit } = useApp();
  const [planMode, setPlanMode] = useState(false);
  const [dryRun, setDryRun] = useState(initialDryRun ?? false);
  const [readOnly, setReadOnly] = useState(initialReadOnly ?? false);
  const [contextBundle, setContextBundle] = useState(initialContextBundle);
  const [userMemory, setUserMemory] = useState<UserMemory | undefined>(initialContextBundle?.memory);
  const { messages, addMessage, updateMessage, replaceMessages, addCost, save, session } = useSession({
    continueLatest: continueSession,
    resumeId,
  });

  // Emit session_start hook on mount
  useEffect(() => {
    if (hookManager?.hasHooks('session_start')) {
      hookManager.emit('session_start', {
        session_id: session.id,
        session_title: session.title,
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Estimate system prompt tokens (rough, based on model + skill count)
  const systemPromptTokens = useMemo(
    () => estimateTokens(`You are Scrutari. Skills: ${skillNames.join(', ')}`),
    [skillNames],
  );

  const addSystemMessage = useCallback((content: string) => {
    addMessage({
      id: randomUUID(),
      role: 'system',
      content,
      timestamp: Date.now(),
    });
  }, [addMessage]);

  const { state: compactionState, triggerCompaction, updateActualUsage, shouldAutoCompact } = useCompaction({
    config,
    messages,
    systemPromptTokens,
    replaceMessages,
    addSystemMessage,
  });

  const onBeforeSend = useCallback(async () => {
    if (shouldAutoCompact()) {
      await triggerCompaction();
    }
  }, [shouldAutoCompact, triggerCompaction]);

  const onAnalysisComplete = useCallback((tickers: string[], skill?: string) => {
    if (!userMemory) return;
    let mem = userMemory;
    for (const t of tickers) {
      mem = recordTickerMention(mem, t);
    }
    if (skill && tickers.length > 0) {
      mem = recordAnalysis(mem, skill, tickers[0]);
    }
    setUserMemory(mem);
    if (contextBundle) {
      setContextBundle({ ...contextBundle, memory: mem });
    }
    saveMemory(mem);
  }, [userMemory, contextBundle]);

  const commands = useMemo(() => getCommandList(skillNames), [skillNames]);

  const handleEscapeMode = useCallback(() => {
    if (planMode) {
      setPlanMode(false);
      addSystemMessage('Plan mode disabled.');
    } else if (dryRun) {
      setDryRun(false);
      addSystemMessage('Dry-run mode disabled.');
    } else if (readOnly) {
      setReadOnly(false);
      addSystemMessage('Read-only mode disabled.');
    }
  }, [planMode, dryRun, readOnly, addSystemMessage]);

  const {
    isProcessing,
    streamingMessageId,
    sessionSpentUsd,
    pendingApproval,
    handleApproval,
    pendingToolPermission,
    handleToolPermission,
    sendMessage,
    abort,
  } = useOrchestrator({
    config,
    verbose,
    planMode,
    dryRun,
    readOnly,
    addMessage,
    updateMessage,
    skillNames,
    skillSummaries,
    agentSkillSummaries,
    mcpClient,
    contextBundle,
    onBeforeSend,
    onUsageUpdate: updateActualUsage,
    onAnalysisComplete,
    initialSessionCost: session.totalCostUsd,
    onCostIncurred: addCost,
    hookManager,
  });

  const [ctrlCCount, setCtrlCCount] = useState(0);
  const [showSkillBrowser, setShowSkillBrowser] = useState(false);
  const [showToolBrowser, setShowToolBrowser] = useState(false);

  // Reset Ctrl+C counter when processing state changes
  useEffect(() => {
    if (!isProcessing) setCtrlCCount(0);
  }, [isProcessing]);

  // Handle Ctrl+C
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      if (isProcessing) {
        abort();
        setCtrlCCount(prev => prev + 1);
        if (ctrlCCount >= 1) {
          if (hookManager?.hasHooks('session_end')) {
            hookManager.emit('session_end', {
              session_id: session.id,
              session_title: session.title,
              total_cost_usd: sessionSpentUsd,
              message_count: messages.length,
            }).catch(() => {});
          }
          save();
          exit();
        }
      } else {
        if (hookManager?.hasHooks('session_end')) {
          hookManager.emit('session_end', {
            session_id: session.id,
            session_title: session.title,
            total_cost_usd: sessionSpentUsd,
            message_count: messages.length,
          }).catch(() => {});
        }
        save();
        exit();
      }
    }
  });

  const handleInput = useCallback((text: string) => {
    const cmd = parseSlashCommand(text);
    if (!cmd) {
      sendMessage(text);
      return;
    }

    switch (cmd.type) {
      case 'plan': {
        const enabling = cmd.args === 'off' ? false : cmd.args === 'on' ? true : !planMode;
        setPlanMode(enabling);
        addSystemMessage(enabling ? 'Plan mode enabled. The LLM will describe what it would do without executing tools.' : 'Plan mode disabled.');
        break;
      }
      case 'dry-run': {
        const enabling = cmd.args === 'off' ? false : cmd.args === 'on' ? true : !dryRun;
        setDryRun(enabling);
        addSystemMessage(enabling ? 'Dry-run mode enabled. Pipelines will return cost estimates without executing.' : 'Dry-run mode disabled.');
        break;
      }
      case 'read-only': {
        const enabling = cmd.args === 'off' ? false : cmd.args === 'on' ? true : !readOnly;
        setReadOnly(enabling);
        addSystemMessage(enabling
          ? 'Read-only mode enabled. Only quotes, filings, and news are available.'
          : 'Read-only mode disabled.');
        break;
      }
      case 'proceed': {
        if (planMode) {
          setPlanMode(false);
          addSystemMessage('Plan mode disabled. Executing...');
          sendMessage('Please proceed with the plan you just described. Execute it now.');
        } else {
          addSystemMessage('Not in plan mode. Use /plan to enable plan mode first.');
        }
        break;
      }
      case 'persona': {
        if (!cmd.args) {
          const names = contextBundle?.availablePersonas ?? [];
          const current = contextBundle?.activePersona?.persona.name ?? 'none';
          addSystemMessage(`Active persona: ${current}\nAvailable: ${names.length > 0 ? names.join(', ') : '(none)'}`);
        } else if (cmd.args === 'off' || cmd.args === 'none') {
          if (contextBundle) {
            setContextBundle({ ...contextBundle, activePersona: undefined });
          }
          addSystemMessage('Persona deactivated.');
        } else {
          const allPersonas = loadAllPersonas();
          const found = findPersona(cmd.args, allPersonas);
          if (found && contextBundle) {
            setContextBundle({ ...contextBundle, activePersona: found });
            addSystemMessage(`Switched to persona: ${found.persona.name} — ${found.persona.description}`);
          } else {
            addSystemMessage(`Unknown persona: "${cmd.args}". Use /persona to see available personas.`);
          }
        }
        break;
      }
      case 'instruct': {
        if (!cmd.args) {
          const current = contextBundle?.instructions.session;
          addSystemMessage(current ? `Current session instructions:\n${current}` : 'No session instructions set. Usage: /instruct <instructions>');
        } else if (cmd.args === 'clear') {
          if (contextBundle) {
            setContextBundle({ ...contextBundle, instructions: { ...contextBundle.instructions, session: undefined } });
          }
          addSystemMessage('Session instructions cleared.');
        } else {
          if (contextBundle) {
            setContextBundle({ ...contextBundle, instructions: { ...contextBundle.instructions, session: cmd.args } });
          }
          addSystemMessage(`Session instructions set: ${cmd.args}`);
        }
        break;
      }
      case 'context': {
        const lines: string[] = [];
        if (contextBundle) {
          lines.push(`Persona: ${contextBundle.activePersona?.persona.name ?? 'none'}`);
          lines.push(`Analysis depth: ${contextBundle.preferences.analysis_depth}`);
          lines.push(`Risk framing: ${contextBundle.preferences.risk_framing}`);
          if (contextBundle.preferences.favorite_tickers.length > 0) {
            lines.push(`Favorite tickers: ${contextBundle.preferences.favorite_tickers.join(', ')}`);
          }
          if (contextBundle.instructions.global) lines.push('Global instructions: loaded');
          if (contextBundle.instructions.project) lines.push('Project instructions: loaded');
          if (contextBundle.instructions.local) lines.push('Local instructions: loaded');
          if (contextBundle.instructions.session) lines.push(`Session instructions: ${contextBundle.instructions.session}`);
          lines.push(`Rules: ${contextBundle.rules.length} loaded`);
          lines.push(`Available personas: ${contextBundle.availablePersonas.join(', ') || '(none)'}`);
          if (contextBundle.memory) {
            const topTickers = contextBundle.memory.frequent_tickers.slice(0, 5);
            if (topTickers.length > 0) {
              lines.push(`Top tickers: ${topTickers.map(t => `${t.ticker}(${t.count})`).join(', ')}`);
            }
            const recent = contextBundle.memory.analysis_history.slice(-3).reverse();
            if (recent.length > 0) {
              lines.push(`Recent analyses: ${recent.map(a => `${a.skill}/${a.ticker}`).join(', ')}`);
            }
          }
        } else {
          lines.push('No context loaded.');
        }
        addSystemMessage(lines.join('\n'));
        break;
      }
      case 'compact': {
        triggerCompaction(cmd.args || undefined);
        break;
      }
      case 'activate': {
        if (!cmd.args) {
          addSystemMessage('Usage: /activate <skill-name>. Use /skills to see available agent skills.');
        } else {
          sendMessage(`Please activate the agent skill "${cmd.args}".`);
        }
        break;
      }
      case 'skills':
        setShowSkillBrowser(true);
        break;
      case 'tools':
        setShowToolBrowser(true);
        break;
      case 'mcp': {
        const configuredServers = config.mcp.servers;
        if (configuredServers.length === 0 && (!mcpClient || mcpClient.size === 0)) {
          addSystemMessage('No MCP servers configured. Use "scrutari mcp add" to add one.');
        } else {
          const infos = mcpClient?.getServerInfos() ?? [];
          const connectedNames = new Set(infos.map(i => i.name));
          const lines: string[] = [];
          for (const info of infos) {
            lines.push(`  ${info.name} (${info.transport}) — ${info.tools.length} tools — connected`);
          }
          for (const server of configuredServers) {
            if (!connectedNames.has(server.name)) {
              const transport = server.command ? 'stdio' : 'http';
              lines.push(`  ${server.name} (${transport}) — disconnected`);
            }
          }
          addSystemMessage(`MCP Servers (${infos.length}/${configuredServers.length} connected):\n${lines.join('\n')}`);
        }
        break;
      }
      case 'help':
        addSystemMessage('Available commands: /plan — toggle plan mode, /proceed — exit plan mode and execute the plan, /dry-run — toggle dry-run mode, /read-only — toggle read-only mode, /compact [instructions] — compact context window, /skills — browse skills, /tools — show tools and MCP servers, /mcp — show MCP server status, /activate <name> — activate an agent skill, /persona [name|off] — switch persona, /instruct <text> — set session instructions, /context — show active context, /help — show this help. You can also type /<skill-name> [args] to run a skill directly.\n\nTips: Type / to see all commands with autocomplete. Use TAB to complete, arrows to navigate. Press ESC to exit plan/dry-run/read-only mode.');
        break;
      default: {
        // Try matching as a skill command (e.g., /deepdive NVDA --depth full)
        const cmdName = cmd.raw.slice(1).split(' ')[0].toLowerCase();
        const skillCmd = parseSkillCommand(cmdName, cmd.args, skillNames);
        if (skillCmd) {
          sendMessage(buildSkillMessage(skillCmd));
        } else {
          addSystemMessage(`Unknown command: ${cmd.raw}`);
        }
        break;
      }
    }
  }, [sendMessage, planMode, dryRun, readOnly, addSystemMessage, contextBundle, skillNames]);

  const loadSkillDetail = useCallback(async (name: string): Promise<SkillDetail | null> => {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const thisDir = dirname(thisFile);
      let builtInDir = resolve(thisDir, '..', 'skills');
      if (!existsSync(builtInDir)) builtInDir = resolve(thisDir, '..', '..', '..', '..', 'skills');
      const uDir = resolve(homedir(), '.scrutari', 'skills');

      const scanned = scanSkillFiles(builtInDir, uDir);
      const match = scanned.find(s => s.name === name);
      if (!match) return null;

      const entry = loadSkillFile(match.filePath, match.source);
      const estimate = estimatePipelineCost(entry.skill);

      return {
        name: entry.skill.name,
        description: entry.skill.description,
        source: entry.source,
        inputs: (entry.skill.inputs ?? []).map(i => ({
          name: i.name,
          type: i.type,
          required: i.required,
          default: i.default,
          description: i.description,
        })),
        stages: entry.skill.stages.map(s => ({
          name: s.name,
          model: s.model,
          description: s.description,
          tools: s.tools,
          input_from: s.input_from,
        })),
        estimate,
      };
    } catch {
      return null;
    }
  }, []);

  const builtInToolGroups: BuiltInToolGroup[] = useMemo(() => [
    {
      group: 'edgar',
      tools: [
        { name: 'edgar_search_filings', description: 'Search SEC EDGAR for company filings' },
        { name: 'edgar_get_filing', description: 'Fetch content of a specific SEC filing' },
        { name: 'edgar_get_financials', description: 'Fetch structured financial data (XBRL)' },
      ],
    },
    {
      group: 'market-data',
      tools: [
        { name: 'market_data_get_quote', description: 'Get current stock quote data' },
        { name: 'market_data_get_history', description: 'Get historical price data' },
        { name: 'market_data_get_financials', description: 'Get financial statements' },
      ],
    },
    {
      group: 'news',
      tools: [
        { name: 'news_search', description: 'Search for recent news articles' },
      ],
      envVar: 'BRAVE_API_KEY',
      setupHint: 'export BRAVE_API_KEY=<your-api-key> (https://api.search.brave.com)',
    },
  ], []);

  const builtInMcpServers: BuiltInMcpServer[] = useMemo(() => [
    {
      name: 'marketonepager',
      description: 'Financial data API — balance sheets, income statements, metrics, and more.',
      envVar: 'MARKETONEPAGER_KEY',
      urlEnvVar: 'MARKETONEPAGER_URL',
      defaultUrl: 'http://localhost:8001/mcp',
    },
  ], []);

  const sessionInfo = continueSession || resumeId
    ? session.title
    : undefined;

  // Split messages into completed (rendered once via Static) and streaming (dynamic).
  // This prevents completed messages from re-rendering during streaming, which
  // eliminates flickering and makes text copyable.
  type StaticItem =
    | { id: string; type: 'banner' }
    | { id: string; type: 'message'; msg: ChatMessage };

  const staticItems = useMemo<StaticItem[]>(() => {
    const items: StaticItem[] = [{ id: '__banner__', type: 'banner' }];
    for (const m of messages) {
      if (m.id !== streamingMessageId) {
        items.push({ id: m.id, type: 'message', msg: m });
      }
    }
    return items;
  }, [messages, streamingMessageId]);

  const streamingMessage = streamingMessageId
    ? messages.find(m => m.id === streamingMessageId)
    : undefined;

  if (showSkillBrowser && skillSummaries) {
    return (
      <Box flexDirection="column">
        <SkillBrowser
          summaries={skillSummaries}
          onSelect={(command) => {
            setShowSkillBrowser(false);
            sendMessage(command);
          }}
          onClose={() => setShowSkillBrowser(false)}
          loadDetail={loadSkillDetail}
        />
      </Box>
    );
  }

  if (showToolBrowser) {
    return (
      <Box flexDirection="column">
        <ToolBrowser
          builtInGroups={builtInToolGroups}
          builtInMcpServers={builtInMcpServers}
          mcpServers={mcpClient?.getServerInfos() ?? []}
          configuredServerNames={config.mcp.servers.map(s => s.name)}
          onClose={() => setShowToolBrowser(false)}
        />
      </Box>
    );
  }

  return (
    <>
      <Static items={staticItems}>
        {(item) => {
          if (item.type === 'banner') {
            return (
              <WelcomeBanner
                key={item.id}
                version={version}
                model={config.defaults.model}
                provider={config.defaults.provider}
                cwd={cwd}
                sessionInfo={sessionInfo}
                recentSessions={recentSessions}
              />
            );
          }
          return (
            <MessageItem key={item.id} msg={item.msg} isStreaming={false} verbose={verbose} />
          );
        }}
      </Static>
      <Box flexDirection="column">
        {streamingMessage && (
          <MessageItem msg={streamingMessage} isStreaming={true} verbose={verbose} />
        )}
        <ContextUsageBar
          currentTokens={compactionState.contextUsage.estimatedTokens}
          maxTokens={compactionState.contextUsage.maxTokens}
          isCompacting={compactionState.isCompacting}
        />
        <BudgetDisplay spentUsd={sessionSpentUsd} budgetUsd={config.defaults.session_budget_usd} />
        {pendingApproval ? (
          <ApprovalPrompt
            estimate={pendingApproval.estimate}
            onApprove={() => handleApproval(true)}
            onDeny={() => handleApproval(false)}
          />
        ) : pendingToolPermission ? (
          <ToolPermissionPrompt
            toolName={pendingToolPermission.toolName}
            args={pendingToolPermission.args}
            onApprove={() => handleToolPermission(true)}
            onDeny={() => handleToolPermission(false)}
          />
        ) : (
          <InputPrompt
            onSubmit={handleInput}
            disabled={isProcessing}
            planMode={planMode}
            dryRun={dryRun}
            readOnly={readOnly}
            onEscapeMode={handleEscapeMode}
            commands={commands}
          />
        )}
      </Box>
    </>
  );
}
