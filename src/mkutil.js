// @flow
// @format

// Utilities for doing Makefile stuff

import type {
  Variable,
  SymbolTable,
  NamedTable,
  ParsedFile,
  DependentValue,
  FilterFunc,
  ValueMakerFunc,
  Condition,
  Definition
} from './types.js';

const makeIfeq = (variable: string, value: string): Condition => ({
  op: 'eq',
  variable,
  value
});

const makeIfneq = (variable: string, value: string): Condition => ({
  op: 'neq',
  variable,
  value
});

const makeIfdef = (variable: string): Condition => ({
  op: 'def',
  variable
});

const makeIfndef = (variable: string): Condition => ({
  op: 'ndef',
  variable
});

const makeDeclDef = (
  name: string,
  value: string,
  dependsOn: Array<string>,
  condition: Array<Condition>
): Definition => ({ name, type: 'decl', value, dependsOn, condition });

const makeSeqDef = (
  name: string,
  value: string,
  dependsOn: Array<string>,
  condition: Array<Condition>
): Definition => ({ name, type: 'seq', value, dependsOn, condition });

const makeAppend = (
  name: string,
  value: string,
  dependsOn: Array<string>,
  condition: Array<Condition>
): Definition => ({ name, type: 'add', value, dependsOn, condition });

const makeUnDecl = (
  name: string,
  value: string,
  dependsOn: Array<string>,
  condition: Array<Condition>
): Definition => ({ name, type: '?decl', value, dependsOn, condition });

// This takes a value, and returns the resolved value plus the list of
// undefined names within the value
const resolveValue = (
  value: string,
  parsedFile: ParsedFile
): DependentValue => {
  let res = '';
  let loc = 0;
  let unresolved: Set<string> = new Set();
  let flatSymbols = parsedFile.flatSymbols;
  do {
    const newloc = value.indexOf('{', loc);
    if (newloc >= 0) {
      res = res + value.substring(loc, newloc);
      const close = value.indexOf('}', newloc + 1);
      if (close < newloc) {
        return { value: '', unresolved: new Set() };
      }
      const nextSym = value.substring(newloc + 1, close);
      const symVal = flatSymbols.get(nextSym);
      if (!symVal) {
        unresolved.add(nextSym);
        res = `${res}{${nextSym}}`;
      } else {
        // Potentially unbounded recursion here. That would be bad...
        const val = resolveValue(symVal, parsedFile);
        unresolved = new Set([...unresolved, ...val.unresolved]);
        res = res + val.value;
      }
      loc = close + 1;
    } else {
      res = res + value.substr(loc);
      loc = -1;
    }
  } while (loc >= 0);
  return { value: res, unresolved };
};

// Upper-cases with underscores
const getMakeName = (vrbl: Variable, top: Variable) => {
  let name = vrbl.name.toUpperCase();
  while (vrbl.parent && vrbl.parent !== top) {
    vrbl = vrbl.parent;
    name = vrbl.name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_' + name;
  }
  return name;
};

// TODO: This should handle any escaping necessary
const resolvedValue = (vrbl: Variable, parsedFile: ParsedFile): string => {
  if (vrbl.value) {
    const res = resolveValue(vrbl.value, parsedFile);
    return res.value;
  } else {
    return '';
  }
};

const makifyName = (nm: string): string => {
  return nm.toUpperCase().replace(/[^A-Z0-9]/g, '_');
};

const unresolvedValue = (value: string): DependentValue => {
  let res = '';
  let unresolved: Set<string> = new Set();
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
      res = res + value.substr(loc);
      loc = -1;
    }
  } while (loc >= 0);
  return { value: res, unresolved };
};

const getPlainValue: ValueMakerFunc = (
  vrbl: Variable,
  parsedFile: ParsedFile
): DependentValue => {
  if (vrbl.value) {
    return unresolvedValue(vrbl.value);
  } else {
    return { value: '', unresolved: new Set() };
  }
};

const makeDefinitions = (
  top: Variable,
  valueMaker: ValueMakerFunc,
  parsedFile: ParsedFile,
  condition: ?Array<Condition>,
  filter?: FilterFunc
): Array<Definition> => {
  let defined: Array<Definition> = [];
  let toDef: Array<Variable> = [...top.children.values()];
  while (toDef.length > 0) {
    const vrbl: Variable = toDef.pop();
    if (!filter || filter(vrbl)) {
      toDef.push(...vrbl.children.values());
      if (vrbl.value) {
        const varName = getMakeName(vrbl, top);
        const { value, unresolved: deps } = valueMaker(vrbl, parsedFile);
        const def = makeDeclDef(varName, value, [...deps], condition || []);
        defined.push(def);
      }
    }
  }
  return defined;
};

const makeMenuOptions = (
  top: Variable,
  parsedFile: ParsedFile,
  menus: Set<string>,
  initConds: Array<Condition>
): Array<Definition> => {
  let defined: Array<Definition> = [];
  const menu = top.children.get('menu');
  if (!menu) {
    return defined;
  }
  for (let toDump of menu.children.values()) {
    const makeVarName = 'INPUT_' + toDump.name.toUpperCase();
    for (let item of toDump.children.values()) {
      const cn = makeIfeq('${' + makeVarName + '}', item.name);
      const subDef = makeDefinitions(item, getPlainValue, parsedFile, [
        ...initConds,
        cn
      ]);
      subDef.forEach((def: Definition) => {
        def.dependsOn.push(makeVarName);
      });
      defined = [...defined, ...subDef];
    }
  }
  return defined;
};

module.exports = {
  getPlainValue,
  resolve: resolvedValue,
  makeAppend,
  makeDeclDef,
  makeSeqDef,
  makeUnDecl,
  makeIfdef,
  makeIfndef,
  makeIfeq,
  makeIfneq,
  makeDefinitions,
  makeMenuOptions
};
