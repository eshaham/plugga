import React from 'react';

import { ListSelector } from './ListSelector';

interface ConfirmProps {
  label: string;
  onConfirm: (confirmed: boolean) => void;
}

const Confirm: React.FC<ConfirmProps> = ({ label, onConfirm }) => {
  return (
    <ListSelector
      label={label}
      items={[
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ]}
      onSelect={(item) => onConfirm(item.value === 'yes')}
    />
  );
};

export { Confirm };
