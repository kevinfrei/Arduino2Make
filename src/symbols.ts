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
  const self: SymbolTable = { add, get, check, parent: getParent };

  function add(name: string[] | string, value: string | SFn): Sym {
    name = Type.isString(name) ? name.split('.') : name;
    if (name.length <= 0) {
      throw new Error('Invalid name add-attempt to SymbolTable');
    }
    let sub: Sym | undefined = nameMap.get(name[0]);
    if (Type.isUndefined(sub)) {
      sub = MakeSym({ name: name[0], parent: self });
      nameMap.set(name[0], sub);
    }
    if (name.length === 1) {
      // Set (update?) the value
      sub.value = value;
      if (sub.parent !== self) {
        throw new Error('Malformed symbol table!');
      }
      return sub;
    } else {
      // recurse
      if (Type.isUndefined(sub.children)) {
        sub.children = MakeSymbolTable(self);
      }
      const shorter = [...name];
      shorter.shift();
      return sub.children.add(shorter, value);
    }
  }
  function check(lkup: string | string[]): Sym | undefined {
    lkup = Type.isString(lkup) ? lkup.split('.') : lkup;
    if (lkup.length <= 0) {
      throw new Error('Bad symbol name passed to check');
    }
    const res = nameMap.get(lkup[0]);
    if (Type.isUndefined(res)) {
      return res;
    }
    if (lkup.length === 1) {
      return res;
    }
    const shorter = [...lkup];
    shorter.shift();
    return res.children?.check(shorter);
  }
  function get(lkup: string | string[]): Sym {
    const res = check(lkup);
    if (Type.isUndefined(res)) {
      throw new Error(
        `Required symbol "${
          Type.isString(lkup) ? lkup : lkup.join('.')
        }" not found`,
      );
    }
    return res;
  }
  function getParent(): SymbolTable | undefined {
    return container;
  }
  return self;
}
