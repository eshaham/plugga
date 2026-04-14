import { execFile } from 'node:child_process';

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ExecOptions {
  cwd?: string;
}

function exec(
  command: string,
  args: string[],
  options?: ExecOptions
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: options?.cwd }, (error, stdout, stderr) => {
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
export type { ExecOptions, ExecResult };
