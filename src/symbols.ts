import { Type } from '@freik/core-utils';
import { dump } from './main.js';
import type { SimpleSymbol, SymbolTable } from './types.js';

export function getScopedName(fullName: string): string[] {
  return fullName.split('.');
}

// Parsing stuff goes here
function makeSimpleSymbol(
  pieces: string[],
  value: string,
  table: SymbolTable,
  index: number,
  parent: SimpleSymbol | undefined,
): SimpleSymbol | undefined {
  index = index || 0;
  if (index >= pieces.length) {
    dump('err')('Duplicate symbol definition: ' + pieces.join('.'));
    return parent;
  }
  const nm: string = pieces[index];
  let childSym = table.get(nm);
  if (Type.isUndefined(childSym)) {
    childSym = { name: nm, children: new Map(), parent };
    table.set(nm, childSym);
    if (index === pieces.length - 1) {
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
  pieces: string[],
  value: string,
  table: SymbolTable,
): SimpleSymbol | undefined {
  return makeSimpleSymbol(pieces, value, table, 0, undefined);
}

// Lookup the (flat or split) symbol in the table
export function lookupSymbol(
  fullName: string | string[],
  table: SymbolTable,
): string | undefined {
  const pieces = Type.isString(fullName) ? getScopedName(fullName) : fullName;
  for (let i = 0; i < pieces.length; i++) {
    const sym = table.get(pieces[i]);
    if (Type.isUndefined(sym)) {
      return;
    }
    if (i === pieces.length - 1) {
      return sym.value;
    }
    table = sym.children;
  }
}
