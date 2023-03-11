import { Type } from '@freik/core-utils';
import { LookupSymbol } from './symbols.js';
import type {
  Condition,
  Definition,
  DependentValue,
  FilterFunc,
  ParsedFile,
  SimpleSymbol,
  ValueMakerFunc,
} from './types.js';

// Utilities for doing Makefile stuff

export function MakeIfeq(variable: string, value: string): Condition {
  return {
    op: 'eq',
    variable,
    value,
  };
}

export function MakeIfneq(variable: string, value: string): Condition {
  return {
    op: 'neq',
    variable,
    value,
  };
}

export function MakeIfdef(variable: string): Condition {
  return {
    op: 'def',
    variable,
  };
}

export function MakeIfndef(variable: string): Condition {
  return {
    op: 'ndef',
    variable,
  };
}

export function MakeIf(variable: string): Condition {
  return { op: 'raw', variable };
}

export function MakeDeclDef(
  name: string,
  value: string,
  dependsOn?: string[],
  condition?: Condition[],
): Definition {
  return {
    name,
    type: 'decl',
    value,
    dependsOn: dependsOn || [],
    condition: condition || [],
  };
}

export function MakeSeqDef(
  name: string,
  value: string,
  dependsOn?: string[],
  condition?: Condition[],
): Definition {
  return {
    name,
    type: 'seq',
    value,
    dependsOn: dependsOn || [],
    condition: condition || [],
  };
}

export function MakeAppend(
  name: string,
  value: string,
  dependsOn?: string[],
  condition?: Condition[],
): Definition {
  return {
    name,
    type: 'add',
    value,
    dependsOn: dependsOn || [],
    condition: condition || [],
  };
}

export function MakeUnDecl(
  name: string,
  value: string,
  dependsOn?: string[],
  condition?: Condition[],
): Definition {
  return {
    name,
    type: '?decl',
    value,
    dependsOn: dependsOn || [],
    condition: condition || [],
  };
}

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

export function makifyName(nm: string): string {
  return nm.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

// Upper-cases with underscores
function getMakeName(vrbl: SimpleSymbol, top: SimpleSymbol) {
  let name = vrbl.name;
  while (vrbl.parent && vrbl.parent !== top) {
    vrbl = vrbl.parent;
    name = vrbl.name + '_' + name;
  }
  return makifyName(name);
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
      const symName = makifyName(nextSym);
      unresolved.add(symName);
      res = res + '${' + symName + '}';
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

export function MakeDefinitions(
  top: SimpleSymbol,
  valueMaker: ValueMakerFunc,
  parsedFile: ParsedFile,
  condition: Condition[] | undefined | null,
  filter?: FilterFunc,
): Definition[] {
  const defined: Definition[] = [];
  const toDef: SimpleSymbol[] = [...top.children.values()];
  while (toDef.length > 0) {
    const foo = toDef.pop();
    if (!foo) continue; // Typescript is dumber than Flow here...
    const vrbl: SimpleSymbol = foo;
    if (!filter || filter(vrbl)) {
      toDef.push(...vrbl.children.values());
      if (vrbl.value) {
        const varName = getMakeName(vrbl, top);
        const { value, unresolved: deps } = valueMaker(vrbl, parsedFile);
        const def = MakeDeclDef(varName, value, [...deps], condition || []);
        defined.push(def);
      }
    }
  }
  return defined;
}

export function MakeMenuOptions(
  top: SimpleSymbol,
  parsedFile: ParsedFile,
  _menus: Set<string>,
  initConds: Condition[],
): Definition[] {
  let defined: Definition[] = [];
  const menu = top.children.get('menu');
  if (!menu) {
    return defined;
  }
  for (const toDump of menu.children.values()) {
    const makeVarName = 'IN_' + toDump.name.toUpperCase();
    for (const item of toDump.children.values()) {
      const cn = MakeIfeq('${' + makeVarName + '}', item.name);
      const subDef = MakeDefinitions(item, GetPlainValue, parsedFile, [
        ...initConds,
        cn,
      ]);
      subDef.forEach((def: Definition) => {
        def.dependsOn.push(makeVarName);
      });
      defined = [...defined, ...subDef];
    }
  }
  return defined;
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
