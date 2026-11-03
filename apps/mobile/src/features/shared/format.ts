export function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDay(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function groupByDay<T extends { createdAt: string }>(
  items: readonly T[],
) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = new Date(item.createdAt).toDateString();
    const group = groups.get(day) ?? [];
    group.push(item);
    groups.set(day, group);
  }
  return [...groups].map(([day, entries]) => ({ day, entries }));
}
