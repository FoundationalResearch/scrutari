import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { homedir, userInfo } from 'node:os';
import type { SessionSummary } from '../session/types.js';

interface WelcomeBannerProps {
  version: string;
  model: string;
  provider: string;
  cwd: string;
  sessionInfo?: string;
  recentSessions: SessionSummary[];
}

/* ── Owl mascot ─────────────────────────────────────────────── */

const OWL = `   ,___,
   (O,O)
   /)  )
  --"-"--`;

/* ── Helpers ─────────────────────────────────────────────────── */

function shortPath(fullPath: string): string {
  const home = homedir();
  if (fullPath.startsWith(home)) {
    return '~' + fullPath.slice(home.length);
  }
  return fullPath;
}

function shortModel(modelId: string): string {
  if (modelId.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
  if (modelId.includes('claude-opus-4')) return 'Claude Opus 4';
  if (modelId.includes('claude-haiku')) return 'Claude Haiku';
  if (modelId.includes('gpt-4o-mini')) return 'GPT-4o Mini';
  if (modelId.includes('gpt-4o')) return 'GPT-4o';
  if (modelId.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
  if (modelId.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  if (modelId.includes('gemini-2.0-flash')) return 'Gemini 2.0 Flash';
  return modelId;
}

function getUserName(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER || process.env.USERNAME || 'there';
  }
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ── Banner ──────────────────────────────────────────────────── */

export function WelcomeBanner({
  version,
  model,
  provider,
  cwd,
  sessionInfo,
  recentSessions,
}: WelcomeBannerProps): React.ReactElement {
  const { stdout } = useStdout();
  const termWidth = stdout.columns || 80;
  const boxWidth = termWidth;

  // ── Top border with embedded title ──
  const titleText = ` scrutari v${version} `;
  const fillLen = Math.max(0, boxWidth - 3 - titleText.length);
  const topBorder = `╭─${titleText}${'─'.repeat(fillLen)}╮`;

  const userName = getUserName();

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Top border line with embedded title */}
      <Text color="blue">{topBorder}</Text>

      {/* Main content box (no top border — our custom line handles it) */}
      <Box
        borderStyle="round"
        borderColor="blue"
        borderTop={false}
        paddingX={2}
        paddingY={1}
        width={boxWidth}
      >
        <Box flexDirection="row" width="100%">
          {/* ── Left column: greeting, owl, info ── */}
          <Box flexDirection="column" width="50%">
            <Text bold>
              {sessionInfo
                ? `Resumed session`
                : `Welcome, ${userName}!`}
            </Text>
            <Text>{' '}</Text>

            {OWL.split('\n').map((line, i) => (
              <Text key={i} color="blue">{line}</Text>
            ))}

            <Text>{' '}</Text>
            <Text dimColor>
              {shortModel(model)} · {provider}
            </Text>
            <Text dimColor>{shortPath(cwd)}</Text>
          </Box>

          {/* ── Right column: tips + sessions (with left-border separator) ── */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="blue"
            borderLeft
            borderTop={false}
            borderBottom={false}
            borderRight={false}
            paddingLeft={2}
            flexGrow={1}
          >
            <Text bold color="blue">Tips for getting started</Text>
            <Text>
              <Text dimColor>{'"analyze NVDA"'}</Text>
              <Text>{' run a deep analysis'}</Text>
            </Text>
            <Text>
              <Text dimColor>{'"what is AAPL at?"'}</Text>
              <Text>{' get a stock quote'}</Text>
            </Text>
            <Text>
              <Text dimColor>{'"search TSLA filings"'}</Text>
              <Text>{' search SEC EDGAR'}</Text>
            </Text>
            <Text>{' '}</Text>
            <Text bold color="blue">Recent sessions</Text>
            {recentSessions.length === 0 ? (
              <Text dimColor>No recent sessions</Text>
            ) : (
              recentSessions.slice(0, 3).map(s => (
                <Text key={s.id}>
                  <Text dimColor>
                    {s.title.length > 30
                      ? s.title.slice(0, 27) + '...'
                      : s.title}
                  </Text>
                  <Text dimColor>{' '}{formatTimeAgo(s.updatedAt)}</Text>
                </Text>
              ))
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
