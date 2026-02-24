import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ToolBrowser } from './ToolBrowser.js';
import type { BuiltInToolGroup, BuiltInMcpServer } from './ToolBrowser.js';
import type { MCPServerInfo } from '@scrutari/mcp';

const builtInGroups: BuiltInToolGroup[] = [
  {
    group: 'edgar',
    tools: [
      { name: 'edgar_search_filings', description: 'Search SEC EDGAR' },
      { name: 'edgar_get_filing', description: 'Get a filing' },
    ],
  },
  {
    group: 'market-data',
    tools: [
      { name: 'market_data_get_quote', description: 'Get stock quote' },
    ],
  },
];

const builtInMcpServers: BuiltInMcpServer[] = [
  {
    name: 'marketonepager',
    description: 'Financial data API — balance sheets, income statements, metrics.',
    envVar: 'MARKETONEPAGER_KEY',
    defaultUrl: 'http://localhost:8001/mcp',
  },
];

const connectedMarketOnePager: MCPServerInfo = {
  name: 'marketonepager',
  transport: 'http',
  tools: [
    { qualifiedName: 'marketonepager/get_balance_sheet', originalName: 'get_balance_sheet', serverName: 'marketonepager', description: 'Get balance sheet data for a company' },
    { qualifiedName: 'marketonepager/get_metrics', originalName: 'get_metrics', serverName: 'marketonepager', description: 'Get financial metrics' },
  ],
  serverName: 'MarketOnePager',
  serverVersion: '1.0.0',
};

describe('ToolBrowser list view', () => {
  it('renders title', () => {
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={builtInMcpServers}
        mcpServers={[connectedMarketOnePager]}
        configuredServerNames={['marketonepager']}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('Tools');
  });

  it('shows built-in tool groups', () => {
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('edgar');
    expect(lastFrame()).toContain('market-data');
  });

  it('shows connected built-in MCP server', () => {
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={builtInMcpServers}
        mcpServers={[connectedMarketOnePager]}
        configuredServerNames={['marketonepager']}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('marketonepager');
    expect(lastFrame()).toContain('connected');
  });

  it('shows not-configured built-in MCP server with setup hint', () => {
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={builtInMcpServers}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('marketonepager');
    expect(lastFrame()).toContain('not configured');
    expect(lastFrame()).toContain('MARKETONEPAGER_KEY');
  });

  it('shows disconnected user MCP server', () => {
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={builtInMcpServers}
        mcpServers={[]}
        configuredServerNames={['my-server']}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('my-server');
    expect(lastFrame()).toContain('disconnected');
  });

  it('shows tool counts in summary', () => {
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={builtInMcpServers}
        mcpServers={[connectedMarketOnePager]}
        configuredServerNames={['marketonepager']}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('3 built-in');
    expect(lastFrame()).toContain('2 MCP tools');
    expect(lastFrame()).toContain('1/1 servers connected');
  });

  it('shows partial connection status', () => {
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={builtInMcpServers}
        mcpServers={[connectedMarketOnePager]}
        configuredServerNames={['marketonepager', 'offline-server']}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('1/2 servers connected');
  });

  it('shows empty state when no tools', () => {
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={[]}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('No tools configured');
  });

  it('calls onClose when q is pressed', async () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={onClose}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('q');
    await new Promise(r => setTimeout(r, 50));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows navigation hints', () => {
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('Navigate');
    expect(lastFrame()).toContain('View endpoints');
  });
});

describe('ToolBrowser built-in tool group envVar status', () => {
  it('shows not-configured for built-in group when envVar is missing', () => {
    delete process.env.TEST_NEWS_KEY;
    const groups: BuiltInToolGroup[] = [
      {
        group: 'news',
        tools: [{ name: 'news_search', description: 'Search news' }],
        envVar: 'TEST_NEWS_KEY',
        setupHint: 'export TEST_NEWS_KEY=<your-key>',
      },
    ];
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={groups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('news');
    expect(lastFrame()).toContain('not configured');
    expect(lastFrame()).toContain('TEST_NEWS_KEY');
  });

  it('shows available for built-in group when envVar is set', () => {
    process.env.TEST_NEWS_KEY = 'some-key';
    const groups: BuiltInToolGroup[] = [
      {
        group: 'news',
        tools: [{ name: 'news_search', description: 'Search news' }],
        envVar: 'TEST_NEWS_KEY',
      },
    ];
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={groups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    expect(lastFrame()).toContain('news');
    expect(lastFrame()).toContain('(1 tools)');
    expect(lastFrame()).not.toContain('not configured');
    delete process.env.TEST_NEWS_KEY;
  });

  it('excludes unconfigured tool group from built-in count', () => {
    delete process.env.TEST_NEWS_KEY;
    const groups: BuiltInToolGroup[] = [
      {
        group: 'edgar',
        tools: [
          { name: 'edgar_search_filings', description: 'Search SEC EDGAR' },
          { name: 'edgar_get_filing', description: 'Get a filing' },
        ],
      },
      {
        group: 'news',
        tools: [{ name: 'news_search', description: 'Search news' }],
        envVar: 'TEST_NEWS_KEY',
      },
    ];
    const { lastFrame } = render(
      <ToolBrowser
        builtInGroups={groups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    // Only edgar's 2 tools should be counted, not news's 1
    expect(lastFrame()).toContain('2 built-in');
  });

  it('does not open detail view for unconfigured built-in group', async () => {
    delete process.env.TEST_NEWS_KEY;
    const groups: BuiltInToolGroup[] = [
      {
        group: 'news',
        tools: [{ name: 'news_search', description: 'Search news' }],
        envVar: 'TEST_NEWS_KEY',
      },
    ];
    const { lastFrame, stdin } = render(
      <ToolBrowser
        builtInGroups={groups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r'); // Enter on news
    await new Promise(r => setTimeout(r, 50));
    // Should stay on list view since no tools (unconfigured)
    expect(lastFrame()).toContain('Navigate');
    expect(lastFrame()).not.toContain('Endpoints');
  });
});

describe('ToolBrowser detail view', () => {
  it('shows detail view on Enter for built-in group', async () => {
    const { lastFrame, stdin } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    // edgar is selected by default, press Enter
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('edgar');
    expect(frame).toContain('edgar_search_filings');
    expect(frame).toContain('Search SEC EDGAR');
    expect(frame).toContain('edgar_get_filing');
    expect(frame).toContain('Endpoints (2)');
  });

  it('shows detail view for connected MCP server with qualified names', async () => {
    const { lastFrame, stdin } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={builtInMcpServers}
        mcpServers={[connectedMarketOnePager]}
        configuredServerNames={['marketonepager']}
        onClose={vi.fn()}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    // Navigate to marketonepager (index 2)
    stdin.write('\x1b[B'); // down
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\x1b[B'); // down
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r'); // enter
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('marketonepager');
    expect(frame).toContain('connected');
    expect(frame).toContain('Endpoints (2)');
    expect(frame).toContain('marketonepager/get_balance_sheet');
    expect(frame).toContain('Get balance sheet data');
    expect(frame).toContain('marketonepager/get_metrics');
    expect(frame).toContain('http');
  });

  it('shows transport and version in detail view', async () => {
    const { lastFrame, stdin } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={builtInMcpServers}
        mcpServers={[connectedMarketOnePager]}
        configuredServerNames={['marketonepager']}
        onClose={vi.fn()}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\x1b[B');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\x1b[B');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('Transport:');
    expect(frame).toContain('http');
    expect(frame).toContain('Version:');
    expect(frame).toContain('1.0.0');
  });

  it('returns to list view on Esc', async () => {
    const { lastFrame, stdin } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r'); // enter detail
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('Endpoints');
    stdin.write('\x1b'); // esc
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('Navigate');
  });

  it('returns to list view on q', async () => {
    const { lastFrame, stdin } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={[]}
        mcpServers={[]}
        configuredServerNames={[]}
        onClose={vi.fn()}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('Endpoints');
    stdin.write('q');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('Navigate');
  });

  it('does not open detail view for sections with no tools', async () => {
    const { lastFrame, stdin } = render(
      <ToolBrowser
        builtInGroups={builtInGroups}
        builtInMcpServers={builtInMcpServers}
        mcpServers={[]}
        configuredServerNames={['offline-server']}
        onClose={vi.fn()}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    // Navigate to marketonepager (not configured, no tools) at index 2
    stdin.write('\x1b[B');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\x1b[B');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    // Should still be on list view since no tools to show
    expect(lastFrame()).toContain('Navigate');
    expect(lastFrame()).not.toContain('Endpoints');
  });
});
