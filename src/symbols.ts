import { Type } from '@freik/core-utils';
import { dump } from './main.js';
import type { ScopedName, SimpleSymbol, SymbolTable } from './types.js';

export function getScopedName(fullName: string): ScopedName {
  const names = fullName.split('.');
  const getElement: (index: number) => string = (index: number) => {
    if (index >= 0 && index < names.length) {
      return names[index];
    }
    throw Error('Invalid element index!');
  };
  const getFullName: () => string = () => names.join('.');
  const length: () => number = () => names.length;
  return { getElement, getFullName, length };
}

// Parsing stuff goes here
function makeSimpleSymbol(
  pieces: ScopedName,
  value: string | (() => string),
  table: SymbolTable,
  index: number,
  parent: SimpleSymbol | undefined,
): SimpleSymbol | undefined {
  index = index || 0;
  if (index >= pieces.length()) {
    dump('err')('Duplicate symbol definition: ' + pieces.getFullName());
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
export function makeSymbol(
  piecesOrName: string,
  value: string | (() => string),
  table: SymbolTable,
): SimpleSymbol | undefined {
  return makeSimpleSymbol(
    getScopedName(piecesOrName),
    value,
    table,
    0,
    undefined,
  );
}

// Lookup the (flat or split) symbol in the table
export function lookupSymbol(
  fullName: string | ScopedName,
  table: SymbolTable,
): string | (() => string) | undefined {
  const pieces = Type.isString(fullName) ? getScopedName(fullName) : fullName;
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
