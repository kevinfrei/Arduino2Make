import { Type } from '@freik/core-utils';
import { GetTarget } from './main.js';
import { LookupSymbol } from './symbols.js';
import type { DependentValue, ParsedFile, SimpleSymbol } from './types.js';

// This takes a value, and returns the resolved value plus the list of
// undefined names within the value
function resolveValue(value: string, parsedFile: ParsedFile): DependentValue {
  let res = '';
  let loc = 0;
  let unresolved: Set<string> = new Set();
  do {
    // Find the next {} pair
    const newloc = value.indexOf('{', loc);
    if (newloc >= 0) {
      res = res + value.substring(loc, newloc);
      const close = value.indexOf('}', newloc + 1);
      if (close < newloc) {
        return { value: '', unresolved: new Set() };
      }
      const nextSym = value.substring(newloc + 1, close);
      // Get the value of that symbol
      const symVal = LookupSymbol(nextSym, parsedFile.scopedTable);
      if (Type.isUndefined(symVal)) {
        unresolved.add(nextSym);
        res = `${res}{${nextSym}}`;
      } else {
        // Potentially unbounded/mutual recursion here. That would be bad...
        const val = resolveValue(
          Type.isString(symVal) ? symVal : symVal(),
          parsedFile,
        );
        unresolved = new Set([...unresolved, ...val.unresolved]);
        res = res + val.value;
      }
      loc = close + 1;
    } else {
      res = res + value.substring(loc);
      loc = -1;
    }
  } while (loc >= 0);
  return { value: res, unresolved };
}

// TODO: This should handle any escaping necessary
export function ResolvedValue(
  vrbl: SimpleSymbol,
  parsedFile: ParsedFile,
): string {
  if (vrbl.value) {
    const val = Type.isString(vrbl.value) ? vrbl.value : vrbl.value();
    const res = resolveValue(val, parsedFile);
    return res.value;
  } else {
    return '';
  }
}

function unresolvedValue(value: string): DependentValue {
  let res = '';
  const unresolved: Set<string> = new Set();
  let loc = 0;
  do {
    const newloc = value.indexOf('{', loc);
    if (newloc >= 0) {
      res = res + value.substring(loc, newloc);
      const close = value.indexOf('}', newloc + 1);
      if (close < newloc) {
        return { value: '', unresolved: new Set() };
      }
      const nextSym = value.substring(newloc + 1, close);
      const { name, expansion } = GetTarget().expandName(nextSym);
      unresolved.add(name);
      res = res + expansion;
      loc = close + 1;
    } else {
      res = res + value.substring(loc);
      loc = -1;
    }
  } while (loc >= 0);
  return { value: res, unresolved };
}

export function GetPlainValue(
  vrbl: SimpleSymbol,
  _parsedFile: ParsedFile,
): DependentValue {
  if (vrbl.value) {
    return unresolvedValue(
      Type.isString(vrbl.value) ? vrbl.value : vrbl.value(),
    );
  } else {
    return { value: '', unresolved: new Set() };
  }
}

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
