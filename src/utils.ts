import { isString, isUndefined } from '@freik/typechk';
import { GetTarget } from './main.js';
import { LookupSymbol } from './symbols.js';
import type {
  Definition,
  DependentUpon,
  DependentValue,
  ParsedFile,
  SimpleSymbol,
} from './types.js';

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

export function CalculateChecksAndOrderDefinitions(
  defs: Definition[],
  rules: DependentUpon[],
  optionalDefs: string[],
): { checks: string[]; defs: Definition[] } {
  // Don't know if I'll need the rules or not

  // First, let's identify all the mandatory user-defined symbols
  const allDefs = new Set(defs.map((d) => d.name));
  const tmp: string[] = [];
  const allDeps = new Set(
    tmp.concat(
      ...defs.map((d) => d.dependsOn),
      ...rules.map((rec) => rec.dependsOn),
    ),
  );
  // Remove allDefs from allDeps
  const checks: Set<string> = new Set(
    [...allDeps].filter((x) => !allDefs.has(x)),
  );
  const done: Set<string> = new Set(checks);
  // Clear out known optional values
  optionalDefs.forEach((a) => checks.delete(a));

  // Now checks has the list of all undefined symbols
  // These should have checks emitted in the makefile to validate that the user
  // has defined them already (or have defaults assigned if that's unimportant)

  function allDefined(def: Definition): boolean {
    for (const d of def.dependsOn) {
      if (!done.has(d)) {
        return false;
      }
    }
    return true;
  }
  const ordered: Definition[] = [];
  const stillPending: Map<string, number> = new Map();
  defs.forEach((d: Definition) => {
    let val = stillPending.get(d.name);
    if (typeof val !== 'number') {
      val = 0;
    }
    stillPending.set(d.name, val + 1);
  });
  // This is such a lame, slow sorting algorithm. I really should do better...
  const skip: Set<number> = new Set();
  for (let i = 0; i < defs.length; i++) {
    if (!skip.has(i)) {
      if (allDefined(defs[i])) {
        ordered.push(defs[i]);
        done.add(defs[i].name);
        skip.add(i);
        i = -1;
      }
    }
  }

  return { checks: [...checks.keys()], defs: ordered };
}
