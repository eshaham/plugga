import { getLogFilePath, readLogs } from '~/logging/logger';

interface LogsInput {
  tail?: string;
}

async function handleLogs(input: LogsInput): Promise<void> {
  const tailLines = input.tail ? parseInt(input.tail, 10) : undefined;
  if (
    input.tail &&
    (isNaN(tailLines as number) || (tailLines as number) <= 0)
  ) {
    console.error('Invalid --tail value. Must be a positive integer.');
    return;
  }

  const content = await readLogs(tailLines);
  console.log(content);
  console.log(`\nLog file: ${getLogFilePath()}`);
}

export { handleLogs };
export type { LogsInput };
