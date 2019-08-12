// @flow
// @format

// Utilities for doing Makefile stuff

import type {
  Variable,
  SymbolTable,
  FlatTable,
  NamedTable,
  ParsedFile,
  ResolvedValue,
  FilterFunc
} from './types.js';

// This takes a value, and returns the resolved value plus the list of
// undefined names within the value
const resolveValue = (value: string, parsedFile: ParsedFile): ResolvedValue => {
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
    name = vrbl.name.toUpperCase() + '_' + name;
  }
  return name;
};

// TODO: This should handle any escaping necessary
const getMakeValue = (vrbl: Variable, parsedFile: ParsedFile): string => {
  if (vrbl.value) {
    const res = resolveValue(vrbl.value, parsedFile);
    return res.value;
  } else {
    return '';
  }
};

// top is the root of a 'namespace': We're gonna dump all the children
const dumpMakeVariables = (
  header: string,
  top: Variable,
  parsedFile: ParsedFile,
  filter: ?FilterFunc
): Set<string> => {
  let defined: Set<string> = new Set();
  let toDump: Array<Variable> = [...top.children.values()];
  while (toDump.length > 0) {
    const vrbl: Variable = toDump.pop();
    if (!filter || filter(vrbl)) {
      toDump.push(...vrbl.children.values());
      if (vrbl.value) {
        const varName = getMakeName(vrbl, top);
        const varValue = getMakeValue(vrbl, parsedFile);
        console.log(`${header}${varName}=${varValue}`);
        defined.add(varName);
      }
    }
  }
  return defined;
};

// This dumps 'menu' options nexted in ifeq's
// It returns the set of *probably* defined variables
const dumpMakeMenuOptions = (
  top: Variable,
  parsedFile: ParsedFile,
  menus: Set<string>
): Set<string> => {
  let defined: Set<string> = new Set();
  const menu = top.children.get('menu');
  if (!menu) {
    return defined;
  }
  for (let toDump of menu.children.values()) {
    let first = true;
    const makeVarName = 'INPUT_' + toDump.name.toUpperCase();
    for (let item of toDump.children.values()) {
      const header = first ? 'ifeq' : 'else ifeq';
      first = false;
      console.log(`\t${header} $(${makeVarName}, ${item.name})`);
      const subDef = dumpMakeVariables('\t\t', item, parsedFile);
      defined = new Set([...defined, ...subDef]);
    }
    if (!first) {
      console.log('\telse');
      console.log(`\t\t$(error Unknown or undefined ${makeVarName} target)`);
      console.log('\tendif');
    }
  }
  return defined;
};

module.exports = {
  dumpVars: dumpMakeVariables,
  dumpMenuOptions: dumpMakeMenuOptions,
  getValue: getMakeValue,
  getName: getMakeName,
  resolve: resolveValue
};
