export const PAGE_SIZE = 100;

export async function collectList<T>(
  load: (offset: number) => Promise<{ data: T[]; hasMore: boolean }>,
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await load(offset);
    items.push(...page.data);
    if (!page.hasMore || page.data.length === 0) return items;
    offset += page.data.length;
  }
}
