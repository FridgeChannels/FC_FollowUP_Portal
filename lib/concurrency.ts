/**
 * Resolve `worker` for every item while keeping at most `concurrency` calls in
 * flight. Results keep the input order, so callers can index them positionally.
 *
 * Used for Notion reads that are naturally per-id (page retrieve) and therefore
 * only bounded by the shared Notion limiter.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const requested = Math.trunc(concurrency);
  const limit = Math.min(
    Number.isFinite(requested) && requested > 0 ? requested : 1,
    items.length,
  );
  if (limit <= 0) return results;
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: limit }, run));
  return results;
}
