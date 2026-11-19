import { spawn } from 'node:child_process';

export type GitResult = { ok: boolean; stdout: string };

/** Runs git in a folder; `input` is written to its standard input. A failure is `ok: false`. */
export function git(cwd: string, args: string[], input?: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', () => resolve({ ok: false, stdout: '' }));
    child.on('close', (code) => {
      resolve({ ok: code === 0, stdout: Buffer.concat(chunks).toString('utf8') });
    });
    // git may exit without reading its input; that is not an error of ours.
    child.stdin.on('error', () => undefined);
    child.stdin.end(input ?? '');
  });
}
