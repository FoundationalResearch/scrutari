import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputPromptProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function InputPrompt({ onSubmit, disabled }: InputPromptProps): React.ReactElement {
  const [value, setValue] = useState('');

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <Box marginTop={1}>
      <Text color={disabled ? 'gray' : 'blue'} bold>{'\u276F'} </Text>
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
