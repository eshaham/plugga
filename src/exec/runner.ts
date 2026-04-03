import { execFile } from 'node:child_process';

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function exec(command: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(command, args, (error, stdout, stderr) => {
      const exitCode =
        error && 'code' in error && typeof error.code === 'number'
          ? error.code
          : error
            ? 1
            : 0;

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
      });
    });
  });
}

export { exec };
export type { ExecResult };
