// The basic types for a parsed file:
export type SimpleSymbol = {
  name: string;
  value?: string | (() => string);
  parent?: SimpleSymbol;
  children: SymbolTable;
};
// This is the scoped c(b(a)) -> "Something Here" list:
export type SymbolTable = Map<string, SimpleSymbol>;
// A parsed file as something fancier than a SymbolTable, mostly for historical reasons
export type ParsedFile = { scopedTable: SymbolTable };

export type DependentValue = { value: string; unresolved: Set<string> };

export type FilterFunc = (str: SimpleSymbol) => boolean;
export type ValueMakerFunc = (
  vrbl: SimpleSymbol,
  file: ParsedFile,
) => DependentValue;

export interface CondEq {
  op: 'eq' | 'neq';
  variable: string;
  value: string;
}

export interface CondDef {
  op: 'def' | 'ndef';
  variable: string;
}

export interface Condition {
  op: 'eq' | 'neq' | 'def' | 'ndef' | 'raw';
  variable: string;
  value?: string;
}

export type Definition = {
  name: string;
  type: 'decl' | 'seq' | 'add' | '?decl';
  value: string;
  dependsOn: string[];
  condition: Condition[];
};

export type Recipe = {
  src: string;
  dst: string;
  command: string;
  dependsOn: string[];
};

export type ScopedName = {
  getElement: (index: number) => string;
  getFullName: () => string;
  length: () => number;
};

// Library types:

export type Dependency = { name: string; ver?: string };
export type SemVer = string | { major: number; minor: number; patch: number };
export type Categories =
  | 'Uncategorized'
  | 'Display'
  | 'Communication'
  | 'Signal Input/Output'
  | 'Sensors'
  | 'Device Control'
  | 'Timing'
  | 'Data Storage'
  | 'Data Processing'
  | 'Other';

export type LibProps = {
  name: string;
  version: SemVer;
  author: string[];
  maintainer: string;
  sentence: string;
  paragraph: string;
  category: Categories;
  url: string;
  architecture: string;
  depends: Dependency[];
  staticLink: boolean;
  includes: string[];
  precompiled: boolean | 'full';
  ldflags: string;
};

export type Files = {
  c: string[];
  cpp: string[];
  s: string[];
  h: string[];
  path: string[];
};

export type LibraryFile = {
  props: Partial<LibProps>;
  files: Files;
};

export type Library = LibraryFile & {
  // TODO: Move to target
  defs: Definition[];
};

export type Board = {
  symbols: SymbolTable;
  menuSelections: SymbolTable;
};

export type BoardFile = {
  // Each board gets an item in here:
  boards: Map<string, Board>;
  // The list of menu items (with their pleasant names)
  menus: SymbolTable;
};
