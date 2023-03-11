import { Filter } from '../config.js';
import {
  Condition,
  Definition,
  FilterFunc,
  ParsedFile,
  SimpleSymbol,
  ValueMakerFunc,
} from '../types.js';
import { GetPlainValue } from '../utils.js';

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

export function MakeSrcList(
  name: string,
  files: string[],
  depend: string | string[],
  cnd: Condition[],
): Definition {
  const filteredFiles = Filter(name, files);
  return MakeAppend(
    name,
    filteredFiles.join(' \\\n    '),
    typeof depend === 'string' ? [depend] : depend,
    cnd,
  );
}
