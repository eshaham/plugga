import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getLogDir } from '~/config/paths';

function getLogFilePath(): string {
  return join(getLogDir(), 'plugga.log');
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatLogLine(
  level: string,
  action: string,
  details?: Record<string, unknown>
): string {
  const parts = [`[${formatTimestamp()}]`, `[${level}]`, action];
  if (details && Object.keys(details).length > 0) {
    parts.push(JSON.stringify(details));
  }
  return parts.join(' ') + '\n';
}

async function ensureLogDirectory(): Promise<void> {
  await mkdir(getLogDir(), { recursive: true });
}

async function writeLog(
  level: string,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await ensureLogDirectory();
    const line = formatLogLine(level, action, details);
    await appendFile(getLogFilePath(), line, 'utf-8');
  } catch {
    // logging should never crash the app
  }
}

async function logInfo(
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  await writeLog('INFO', action, details);
}

async function logError(
  action: string,
  error: unknown,
  details?: Record<string, unknown>
): Promise<void> {
  const errorDetails: Record<string, unknown> = { ...details };
  if (error instanceof Error) {
    errorDetails['error'] = error.message;
    errorDetails['stack'] = error.stack;
  } else {
    errorDetails['error'] = String(error);
  }
  await writeLog('ERROR', action, errorDetails);
}

async function logWarn(
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  await writeLog('WARN', action, details);
}

async function readLogs(tailLines?: number): Promise<string> {
  try {
    const content = await readFile(getLogFilePath(), 'utf-8');
    if (!tailLines) {
      return content;
    }
    const lines = content.trimEnd().split('\n');
    return lines.slice(-tailLines).join('\n');
  } catch {
    return 'No logs found.';
  }
}

export { getLogFilePath, logError, logInfo, logWarn, readLogs };
