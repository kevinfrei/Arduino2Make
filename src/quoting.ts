export function QuoteIfNeeded(inv: string): string {
  if (inv.indexOf(' ') < 0) {
    return inv;
  } else {
    return `"${inv}"`;
  }
}
// Trim off quotation marks

export function Unquote(inv: string): string {
  if (inv.length < 2 || inv[0] !== '"' || inv[inv.length - 1] !== '"') {
    return inv;
  }
  return inv.substring(1, inv.length - 1);
}
