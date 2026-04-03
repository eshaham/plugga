import { Text } from 'ink';
import Spinner from 'ink-spinner';
import React from 'react';

import { colors } from '~/tui/styles/colors';

interface StatusMessageProps {
  status: 'loading' | 'success' | 'error' | 'info';
  message: string;
}

const StatusMessage: React.FC<StatusMessageProps> = ({ status, message }) => {
  if (status === 'loading') {
    return (
      <Text color={colors.progress}>
        <Spinner type="dots" /> {message}
      </Text>
    );
  }

  if (status === 'success') {
    return <Text color={colors.success}>✓ {message}</Text>;
  }

  if (status === 'error') {
    return <Text color={colors.error}>✗ {message}</Text>;
  }

  return <Text>{message}</Text>;
};

export { StatusMessage };
