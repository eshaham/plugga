import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import React, { useState } from 'react';

interface TextPromptProps {
  label: string;
  defaultValue?: string;
  mask?: string;
  onSubmit: (value: string) => void;
}

const TextPrompt: React.FC<TextPromptProps> = ({
  label,
  defaultValue,
  mask,
  onSubmit,
}) => {
  const [value, setValue] = useState(defaultValue ?? '');

  const handleSubmit = () => {
    if (value.trim()) {
      onSubmit(value.trim());
    }
  };

  return (
    <Box>
      <Text>{label}: </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        mask={mask}
      />
    </Box>
  );
};

export { TextPrompt };
