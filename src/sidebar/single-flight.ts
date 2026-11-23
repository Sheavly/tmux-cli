/**
 * Makes `task` run one at a time. A call while it runs does not start a second run: it waits for
 * the one running and then for one more, which every call made meanwhile shares. So a slow run
 * costs one run after it, however many timer ticks or keys asked, and each caller's result
 * comes from a run that began after its call.
 */
export function singleFlight(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | undefined;
  let following: Promise<void> | undefined;

  const start = (): Promise<void> => {
    const run = task().finally(() => {
      if (running === run) running = undefined;
    });

    running = run;

    return run;
  };

  return () => {
    if (!running) return start();

    following ??= running
      .catch(() => undefined)
      .then(() => {
        following = undefined;

        return start();
      });

    return following;
  };
}
