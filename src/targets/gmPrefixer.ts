export function MakePrefixer(
  pairs: Iterable<[string, string]>,
): (str: string) => string {
  // Sort the pairs in longest-to-shortest order
  const matches = [...pairs].sort((a, b) => b[0].length - a[0].length);
  return (str: string) => {
    for (const [p, r] of matches) {
      if (str.startsWith(p)) {
        return `${r}${str.substring(p.length)}`;
      }
    }
    return str;
  };
}
