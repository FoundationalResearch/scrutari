import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputPromptProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  planMode?: boolean;
  readOnly?: boolean;
}

export function InputPrompt({ onSubmit, disabled, planMode, readOnly }: InputPromptProps): React.ReactElement {
  const [value, setValue] = useState('');

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const promptColor = disabled ? 'gray' : readOnly ? 'green' : planMode ? 'yellow' : 'blue';

  return (
    <Box marginTop={1}>
      {readOnly && <Text color="green" bold>[READ-ONLY] </Text>}
      {planMode && !readOnly && <Text color="yellow" bold>[PLAN] </Text>}
      <Text color={promptColor} bold>{'\u276F'} </Text>
      {disabled ? (
        <Text dimColor>Waiting for response...</Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
        />
      )}
    </Box>
  );
}
