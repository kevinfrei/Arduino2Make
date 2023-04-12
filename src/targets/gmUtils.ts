import { isUndefined } from '@freik/typechk';
import { Filter } from '../config.js';
import {
  Condition,
  Definition,
  FilterFunc,
  SimpleSymbol,
  ValueMakerFunc,
} from '../types.js';

// Utilities for doing Makefile stuff

// ifeq (VAR, value)
export function MakeIfeq(variable: string, value: string): Condition {
  return {
    op: 'eq',
    variable,
    value,
  };
}

// ifneq (VAR, value)
export function MakeIfneq(variable: string, value: string): Condition {
  return {
    op: 'neq',
    variable,
    value,
  };
}

// ifdef VAR
export function MakeIfdef(variable: string): Condition {
  return {
    op: 'def',
    variable,
  };
}

// ifndef VAR
export function MakeIfndef(variable: string): Condition {
  return {
    op: 'ndef',
    variable,
  };
}

// if variable
export function MakeIf(variable: string): Condition {
  return { op: 'raw', variable };
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

export function MakifyName(nm: string): string {
  return nm.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

// Upper-cases with underscores
function getMakeName(vrbl: SimpleSymbol, top: SimpleSymbol) {
  let name = vrbl.name;
  while (vrbl.parent && vrbl.parent !== top) {
    vrbl = vrbl.parent;
    name = vrbl.name + '_' + name;
  }
  return MakifyName(name);
}

export function MakeDefinitions(
  top: SimpleSymbol,
  valueMaker: ValueMakerFunc,
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
        const { value, unresolved: deps } = valueMaker(vrbl);
        const def = MakeDeclDef(varName, value, [...deps], condition || []);
        defined.push(def);
      }
    }
  }
  return defined;
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

export function prefixAndJoinFiles(
  filteredFiles: string[],
  prefixer?: (str: string) => string,
  trimmer?: string,
): string {
  if (!isUndefined(prefixer)) {
    if (isUndefined(trimmer)) {
      filteredFiles = filteredFiles.map(prefixer);
    } else {
      const reAdd = new Set<number>();
      filteredFiles = filteredFiles
        .map((val, index) => {
          if (val.startsWith(trimmer)) {
            reAdd.add(index);
            return val.substring(trimmer.length);
          }
          return val;
        })
        .map(prefixer)
        .map((val, index) => (reAdd.has(index) ? trimmer + val : val));
    }
  }
  return filteredFiles.join(' \\\n    ');
}

export function MakeSrcList(
  name: string,
  files: string[],
  depend: string | string[],
  cnd: Condition[],
  prefixer?: (str: string) => string,
  trimmer?: string,
): Definition {
  // Filter out user-specified files to remove...
  const filteredFiles = Filter(name, files);
  return MakeAppend(
    name,
    prefixAndJoinFiles(filteredFiles, prefixer, trimmer),
    typeof depend === 'string' ? [depend] : depend,
    cnd,
  );
}
