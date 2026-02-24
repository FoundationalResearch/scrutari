import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { MCPServerInfo } from '@scrutari/mcp';

interface BuiltInToolGroup {
  group: string;
  tools: Array<{ name: string; description: string }>;
  /** Env var required for this tool group (e.g., 'BRAVE_API_KEY'). If set and missing, shows as not-configured. */
  envVar?: string;
  /** Setup hint shown when not configured (e.g., 'export BRAVE_API_KEY=<your-api-key>') */
  setupHint?: string;
}

interface BuiltInMcpServer {
  name: string;
  description: string;
  envVar: string;
  urlEnvVar?: string;
  defaultUrl: string;
}

interface ToolBrowserProps {
  builtInGroups: BuiltInToolGroup[];
  builtInMcpServers: BuiltInMcpServer[];
  mcpServers: MCPServerInfo[];
  configuredServerNames: string[];
  onClose: () => void;
}

export type { BuiltInToolGroup, BuiltInMcpServer };

type SectionStatus = 'connected' | 'disconnected' | 'not-configured' | 'available';

interface Section {
  type: 'builtin' | 'builtin-mcp' | 'mcp';
  label: string;
  description?: string;
  status: SectionStatus;
  transport?: 'stdio' | 'http';
  serverVersion?: string;
  tools: Array<{ name: string; qualifiedName?: string; description?: string }>;
  setupHint?: string;
}

type View = 'list' | 'detail';

export function ToolBrowser({
  builtInGroups,
  builtInMcpServers,
  mcpServers,
  configuredServerNames,
  onClose,
}: ToolBrowserProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<View>('list');
  const [detailSection, setDetailSection] = useState<Section | null>(null);

  const connectedNames = new Set(mcpServers.map(s => s.name));
  const sections: Section[] = [];

  // Built-in tool groups
  for (const group of builtInGroups) {
    const needsKey = group.envVar && !process.env[group.envVar];
    sections.push({
      type: 'builtin',
      label: group.group,
      status: needsKey ? 'not-configured' : 'available',
      tools: needsKey ? [] : group.tools,
      setupHint: needsKey ? (group.setupHint ?? `export ${group.envVar}=<your-api-key>`) : undefined,
    });
  }

  // Built-in MCP servers (e.g., MarketOnePager)
  for (const server of builtInMcpServers) {
    const connected = connectedNames.has(server.name);
    const mcpInfo = mcpServers.find(s => s.name === server.name);

    if (connected && mcpInfo) {
      sections.push({
        type: 'builtin-mcp',
        label: server.name,
        description: server.description,
        status: 'connected',
        transport: mcpInfo.transport,
        serverVersion: mcpInfo.serverVersion,
        tools: mcpInfo.tools.map(t => ({
          name: t.originalName,
          qualifiedName: t.qualifiedName,
          description: t.description,
        })),
      });
    } else {
      sections.push({
        type: 'builtin-mcp',
        label: server.name,
        description: server.description,
        status: 'not-configured',
        tools: [],
        setupHint: `export ${server.envVar}=<your-api-key>`,
      });
    }
  }

  // User-configured MCP servers (exclude built-in MCP names)
  const builtInMcpNames = new Set(builtInMcpServers.map(s => s.name));
  for (const server of mcpServers) {
    if (builtInMcpNames.has(server.name)) continue;
    sections.push({
      type: 'mcp',
      label: server.name,
      status: 'connected',
      transport: server.transport,
      serverVersion: server.serverVersion,
      tools: server.tools.map(t => ({
        name: t.originalName,
        qualifiedName: t.qualifiedName,
        description: t.description,
      })),
    });
  }

  // Disconnected user-configured MCP servers
  for (const name of configuredServerNames) {
    if (builtInMcpNames.has(name)) continue;
    if (!connectedNames.has(name)) {
      sections.push({
        type: 'mcp',
        label: name,
        status: 'disconnected',
        tools: [],
      });
    }
  }

  const totalSections = sections.length;

  useInput((input, key) => {
    if (view === 'detail') {
      if (key.escape || input === 'q' || input === 'Q') {
        setView('list');
        setDetailSection(null);
      }
      return;
    }

    // List view
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(totalSections - 1, prev + 1));
    } else if (key.return) {
      const section = sections[selectedIndex];
      if (section && section.tools.length > 0) {
        setDetailSection(section);
        setView('detail');
      }
    } else if (key.escape || input === 'q' || input === 'Q') {
      onClose();
    }
  });

  if (view === 'detail' && detailSection) {
    return <DetailView section={detailSection} />;
  }

  if (sections.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} marginTop={1}>
        <Text color="blue" bold>Tools</Text>
        <Text dimColor>No tools configured. Add MCP servers in ~/.scrutari/config.yaml</Text>
        <Text dimColor>q: Close</Text>
      </Box>
    );
  }

  const builtInToolCount = builtInGroups
    .filter(g => !g.envVar || process.env[g.envVar])
    .reduce((sum, g) => sum + g.tools.length, 0);
  const mcpToolCount = mcpServers.reduce((sum, s) => sum + s.tools.length, 0);
  const connectedMcpCount = mcpServers.length;
  const totalMcpConfigured = new Set([
    ...configuredServerNames,
    ...builtInMcpServers.map(s => s.name),
  ]).size;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} marginTop={1}>
      <Box gap={1}>
        <Text color="blue" bold>Tools</Text>
        <Text dimColor>
          {builtInToolCount} built-in, {mcpToolCount} MCP tools
          {totalMcpConfigured > 0 && ` (${connectedMcpCount}/${totalMcpConfigured} servers connected)`}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {sections.map((section, i) => {
          const isSelected = i === selectedIndex;

          return (
            <Box key={`${section.type}-${section.label}`} flexDirection="column">
              <Box gap={1}>
                <Text color={isSelected ? 'blue' : undefined} bold={isSelected}>
                  {isSelected ? '\u25b8' : ' '}
                  {section.label}
                </Text>
                {section.type === 'builtin' && section.status === 'available' && (
                  <Text dimColor>({section.tools.length} tools)</Text>
                )}
                {section.type === 'builtin' && section.status === 'not-configured' && (
                  <>
                    <Text color="yellow">{'\u25cb'} not configured</Text>
                    {section.setupHint && <Text dimColor>({section.setupHint})</Text>}
                  </>
                )}
                {(section.type === 'mcp' || section.type === 'builtin-mcp') && section.status === 'connected' && (
                  <Text color="green">
                    {'\u25cf'} connected
                    {section.transport && <Text dimColor> ({section.transport})</Text>}
                    <Text dimColor> {section.tools.length} tools</Text>
                  </Text>
                )}
                {section.type === 'mcp' && section.status === 'disconnected' && (
                  <Text color="red">{'\u25cf'} disconnected</Text>
                )}
                {section.type === 'builtin-mcp' && section.status === 'not-configured' && (
                  <>
                    <Text color="yellow">{'\u25cb'} not configured</Text>
                    <Text dimColor>({section.setupHint})</Text>
                  </>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{'\u2191\u2193'} Navigate  Enter: View endpoints  q/Esc: Close</Text>
      </Box>
    </Box>
  );
}

function DetailView({ section }: { section: Section }): React.ReactElement {
  const statusColor = section.status === 'connected' ? 'green' : section.status === 'disconnected' ? 'red' : 'yellow';
  const statusLabel = section.status === 'not-configured' ? 'not configured' : section.status;
  const statusIcon = section.status === 'connected' ? '\u25cf' : section.status === 'not-configured' ? '\u25cb' : '\u25cf';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} marginTop={1}>
      <Box gap={1}>
        <Text color="blue" bold>{section.label}</Text>
        <Text color={statusColor}>{statusIcon} {statusLabel}</Text>
      </Box>

      {section.description && (
        <Text dimColor>{section.description}</Text>
      )}

      {section.transport && (
        <Box gap={1} marginTop={1}>
          <Text dimColor>Transport:</Text>
          <Text>{section.transport}</Text>
          {section.serverVersion && (
            <>
              <Text dimColor>Version:</Text>
              <Text>{section.serverVersion}</Text>
            </>
          )}
        </Box>
      )}

      {section.tools.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>Endpoints ({section.tools.length}):</Text>
          {section.tools.map(tool => (
            <Box key={tool.name} flexDirection="column" marginLeft={2} marginTop={0}>
              <Box gap={1}>
                <Text color="green">{'\u25cf'}</Text>
                <Text bold>{tool.qualifiedName ?? tool.name}</Text>
              </Box>
              {tool.description && (
                <Box marginLeft={3}>
                  <Text dimColor>{tool.description}</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {section.setupHint && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Setup: <Text color="yellow">{section.setupHint}</Text></Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Esc/q: Back</Text>
      </Box>
    </Box>
  );
}
