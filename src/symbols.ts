import { Type } from '@freik/core-utils';
import { Dump } from './dump.js';
import type {
  DumbSymTbl,
  ScopedName,
  SFn,
  SimpleSymbol,
  SymbolTable,
} from './types.js';

export function MakeScopedName(fullName: string): ScopedName {
  const names = fullName.split('.');
  return {
    getElement: (index: number) => {
      if (index >= 0 && index < names.length) {
        return names[index];
      }
      throw Error('Invalid element index!');
    },
    getFullName: () => names.join('.'),
    length: () => names.length,
  };
}

// Parsing stuff goes here
function makeSimpleSymbol(
  pieces: ScopedName,
  value: string | (() => string),
  table: DumbSymTbl,
  index: number,
  parent: SimpleSymbol | undefined,
): SimpleSymbol | undefined {
  index = index || 0;
  if (index >= pieces.length()) {
    Dump('err')('Duplicate symbol definition: ' + pieces.getFullName());
    return parent;
  }
  const nm = pieces.getElement(index);
  let childSym = table.get(nm);
  if (Type.isUndefined(childSym)) {
    childSym = { name: nm, children: new Map(), parent };
    table.set(nm, childSym);
    if (index === pieces.length() - 1) {
      childSym.value = value;
      return childSym;
    }
  }
  return makeSimpleSymbol(
    pieces,
    value,
    childSym.children,
    index + 1,
    childSym,
  );
}

// Make a symbol in the given symbol table
export function MakeSymbol(
  piecesOrName: string,
  value: string | (() => string),
  table: DumbSymTbl,
): SimpleSymbol | undefined {
  return makeSimpleSymbol(
    MakeScopedName(piecesOrName),
    value,
    table,
    0,
    undefined,
  );
}

// Lookup the (flat or split) symbol in the table
export function LookupSymbol(
  fullName: string | ScopedName,
  table: DumbSymTbl,
): string | (() => string) | undefined {
  const pieces = Type.isString(fullName) ? MakeScopedName(fullName) : fullName;
  for (let i = 0; i < pieces.length(); i++) {
    const sym = table.get(pieces.getElement(i));
    if (Type.isUndefined(sym)) {
      return;
    }
    if (i === pieces.length() - 1) {
      return sym.value;
    }
    table = sym.children;
  }
}

export function GetNestedChild(
  vrbl: SimpleSymbol,
  ...children: string[]
): SimpleSymbol | undefined {
  let v: SimpleSymbol | undefined = vrbl;
  for (const child of children) {
    if (!v) {
      return;
    }
    v = v.children.get(child);
  }
  return v;
}

export function MakeSymbolTable(parent?: SimpleSymbol): SymbolTable {
  const container: SimpleSymbol | undefined = parent;
  const nameMap = new Map<string, SymbolTable>();
  const add = (_name: string[], _value: string | SFn): void => {
    // TODO
  };
  const get = (_lkup: string | ScopedName | string[]): SimpleSymbol => {
    // TODO
    const tmp = MakeSymbol('lkup', '', new Map<string, SimpleSymbol>());
    if (Type.isUndefined(tmp)) {
      throw new Error('welp');
    }
    return tmp;
  };
  const check = (
    _lkup: string | ScopedName | string[],
  ): SimpleSymbol | undefined => {
    if ((_lkup = 'dumb')) return undefined;
  };
  const getParent = (): SimpleSymbol | undefined => container;
  return { add, get, check, parent: getParent };
}
