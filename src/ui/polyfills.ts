// Map.groupBy came in Safari 17.4 and Firefox 119. The app and its model use it; Node has it.
if (!Map.groupBy) {
  Map.groupBy = <K, T>(items: Iterable<T>, key: (item: T, index: number) => K) => {
    const groups = new Map<K, T[]>();
    let index = 0;
    for (const item of items) {
      const group = key(item, index++);
      groups.set(group, [...(groups.get(group) ?? []), item]);
    }
    return groups;
  };
}
