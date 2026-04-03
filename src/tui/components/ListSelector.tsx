import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import React from 'react';

import { colors } from '~/tui/styles/colors';

interface ListItem {
  label: string;
  value: string;
}

interface ListSelectorProps {
  label: string;
  items: ListItem[];
  onSelect: (item: ListItem) => void;
}

const ListSelector: React.FC<ListSelectorProps> = ({
  label,
  items,
  onSelect,
}) => {
  return (
    <Box flexDirection="column">
      <Text>{label}</Text>
      <SelectInput
        items={items}
        onSelect={onSelect}
        indicatorComponent={({ isSelected }) => (
          <Text color={isSelected ? colors.progress : colors.muted}>
            {isSelected ? '❯' : ' '}
          </Text>
        )}
        itemComponent={({ isSelected, label: itemLabel }) =>
          isSelected ? (
            <Text color={colors.progress}>{itemLabel}</Text>
          ) : (
            <Text>{itemLabel}</Text>
          )
        }
      />
    </Box>
  );
};

export { ListSelector };
export type { ListItem };
