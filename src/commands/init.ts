import { render } from 'ink';
import React from 'react';

import { InitFlow } from '~/tui/InitFlow';

async function handleInit(): Promise<void> {
  const { waitUntilExit } = render(React.createElement(InitFlow));
  await waitUntilExit();
}

export { handleInit };
