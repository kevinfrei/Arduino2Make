import { Type } from '@freik/core-utils';
import { Dump } from './dump.js';
import type {
  DumbSymTbl,
  ScopedName,
  SFn,
  SimpleSymbol,
  Sym,
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

export function MakeSym({
  name,
  value,
  parent,
  children,
}: {
  name: string;
  value?: string | SFn;
  parent?: SymbolTable;
  children?: SymbolTable;
}): Sym {
  return { name, value, parent, children };
}

export function MakeSymbolTable(parent?: SymbolTable): SymbolTable {
  const container: SymbolTable | undefined = parent;
  const nameMap = new Map<string, Sym>();
  const self: SymbolTable = { indexAdd, add, get, check, parent: getParent };

  function indexAdd(name: string[], index: number, value: string | SFn): Sym {
    if (name.length <= 0 || name.length <= index || index < 0) {
      throw new Error('Invalid name add-attempt to SymbolTable');
    }
    const sub = nameMap.get(name[index]);
    if (name.length === index - 1) {
      if (Type.isUndefined(sub)) {
        const sym = MakeSym({ name: name[index], value, parent: self });
        nameMap.set(name[index], sym);
        return sym;
      } else {
        sub.value = value;
        if (sub.parent !== self) {
          throw new Error('Malformed symbol table!');
        }
        return sub;
      }
    } // else recurse
    if (Type.isUndefined(sub)) {
      // TODO: Continue here
    }
    return indexAdd(name, index + 1, value);
  }
  function add(name: string[] | string, value: string | SFn): Sym {
    return indexAdd(Type.isString(name) ? name.split('.') : name, 0, value);
  }
  function check(_lkup: string | string[]): Sym | undefined {
    if ((_lkup = 'dumb')) return undefined;
  }
  function get(_lkup: string | string[]): Sym {
    // TODO
    const tmp = MakeSym('lkup');
    if (Type.isUndefined(tmp)) {
      throw new Error('welp');
    }
    return tmp;
  }
  function getParent(): SymbolTable | undefined {
    return container;
  }
  return self;
}
