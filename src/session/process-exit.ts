const EXIT_TIMEOUT_MS = 10_000;

/**
 * Waits until nothing is left in the pane's process group. Sheavly stops its backend and closes
 * its files when hung up, and until then a chat reopened or deleted would share them with it.
 */
export async function waitForExit(pid: number): Promise<void> {
  if (pid <= 0) return;

  const deadline = Date.now() + EXIT_TIMEOUT_MS;

  while (groupIsRunning(pid)) {
    if (Date.now() > deadline) throw new Error('The chat is still shutting down; try again.');

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function groupIsRunning(pid: number): boolean {
  try {
    process.kill(-pid, 0);

    return true;
  } catch (caughtError) {
    if ((caughtError as NodeJS.ErrnoException).code === 'ESRCH') return false;

    throw caughtError;
  }
}
