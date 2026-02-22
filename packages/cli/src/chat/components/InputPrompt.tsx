import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { CommandInfo } from '../commands.js';
import { filterCommands } from '../commands.js';

interface InputPromptProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  planMode?: boolean;
  dryRun?: boolean;
  readOnly?: boolean;
  onEscapeMode?: () => void;
  commands: CommandInfo[];
}

function AutocompleteMenu({
  suggestions,
  selectedIndex,
}: {
  suggestions: CommandInfo[];
  selectedIndex: number;
}): React.ReactElement {
  const maxVisible = 8;
  const visible = suggestions.slice(0, maxVisible);

  return (
    <Box flexDirection="column" marginLeft={2}>
      {visible.map((cmd, i) => (
        <Box key={cmd.name} gap={1}>
          <Text color={i === selectedIndex ? 'blue' : undefined} bold={i === selectedIndex}>
            {i === selectedIndex ? '\u25b8' : ' '}/{cmd.name}
          </Text>
          <Text dimColor>{cmd.description}</Text>
        </Box>
      ))}
      {suggestions.length > maxVisible && (
        <Text dimColor>  ...and {suggestions.length - maxVisible} more</Text>
      )}
    </Box>
  );
}

export function InputPrompt({
  onSubmit,
  disabled,
  planMode,
  dryRun,
  readOnly,
  onEscapeMode,
  commands,
}: InputPromptProps): React.ReactElement {
  const [value, setValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  // Determine if autocomplete menu should show
  const slashQuery = value.startsWith('/') ? value.slice(1).split(' ')[0] : null;
  const hasArgsAfterCommand = value.startsWith('/') && value.includes(' ');
  const suggestions = slashQuery !== null && !hasArgsAfterCommand && !menuDismissed
    ? filterCommands(commands, slashQuery)
    : [];
  const showMenu = suggestions.length > 0 && !disabled;

  const handleChange = (newValue: string) => {
    setValue(newValue);
    setMenuDismissed(false);
    setSelectedIndex(0);
  };

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
    setSelectedIndex(0);
    setMenuDismissed(false);
  };

  useInput((_input, key) => {
    if (disabled) return;

    if (key.tab && showMenu) {
      const selected = suggestions[selectedIndex];
      if (selected) {
        setValue('/' + selected.name + ' ');
        setSelectedIndex(0);
      }
      return;
    }

    if (key.upArrow && showMenu) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow && showMenu) {
      setSelectedIndex(prev => Math.min(suggestions.length - 1, prev + 1));
      return;
    }

    if (key.escape) {
      if (showMenu) {
        setMenuDismissed(true);
      } else if (onEscapeMode) {
        onEscapeMode();
      }
      return;
    }
  }, { isActive: !disabled });

  const promptColor = disabled ? 'gray' : readOnly ? 'green' : planMode ? 'yellow' : dryRun ? 'cyan' : 'blue';

  return (
    <Box flexDirection="column">
      {showMenu && (
        <AutocompleteMenu suggestions={suggestions} selectedIndex={selectedIndex} />
      )}
      <Box marginTop={showMenu ? 0 : 1}>
        {readOnly && <Text color="green" bold>[READ-ONLY] </Text>}
        {planMode && !readOnly && <Text color="yellow" bold>[PLAN] </Text>}
        {dryRun && !planMode && !readOnly && <Text color="cyan" bold>[DRY-RUN] </Text>}
        <Text color={promptColor} bold>{'\u276F'} </Text>
        {disabled ? (
          <Text dimColor>Waiting for response...</Text>
        ) : (
          <TextInput
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder="Type a message or / for commands..."
          />
        )}
      </Box>
    </Box>
  );
}
