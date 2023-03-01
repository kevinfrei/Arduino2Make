// The basic types for a parsed file:
export type SimpleSymbol = {
  name: string;
  value?: string;
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

type Dependency = { name: string; ver: string };
type SemVer = string | { major: number; minor: number; patch: number };
type Categories =
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
  linkage?: boolean;
  includes: string[];
  precompiled: boolean | 'full';
  ldflags: string;
};
