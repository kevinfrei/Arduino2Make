import { isString, isUndefined } from '@freik/typechk';

import { LookupSymbol } from './symbols';
import { GetTarget } from './target';
import type { DependentValue, ParsedFile, SimpleSymbol } from './types';

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
      if (isUndefined(symVal)) {
        unresolved.add(nextSym);
        res = `${res}{${nextSym}}`;
      } else {
        // Potentially unbounded/mutual recursion here. That would be bad...
        const val = resolveValue(
          isString(symVal) ? symVal : symVal(),
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
    const val = isString(vrbl.value) ? vrbl.value : vrbl.value();
    const res = resolveValue(val, parsedFile);
    return res.value;
  } else {
    return '';
  }
}

export function MakeDependentValue(value: string): DependentValue {
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

export function ResolveString(
  val: DependentValue,
  src: string,
  dst: string,
): DependentValue {
  return { value: val.value.replace(src, dst), unresolved: val.unresolved };
}

// TODO: This is using make syntax. I need to get back to Arduino syntax
// and only use Make syntax in the Makefile target
export function MakeResolve(
  val: DependentValue,
  toResolve: string,
  resolvedValue: string,
): DependentValue {
  const unresolved = new Set(val.unresolved);
  unresolved.delete(toResolve);
  return ResolveString(
    { value: val.value, unresolved },
    '${' + toResolve + '}',
    resolvedValue,
  );
}

export function GetPlainValue(vrbl: SimpleSymbol): DependentValue {
  if (vrbl.value) {
    return MakeDependentValue(isString(vrbl.value) ? vrbl.value : vrbl.value());
  } else {
    return { value: '', unresolved: new Set() };
  }
}
