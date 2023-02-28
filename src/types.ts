// The basic types for a parsed file:
export type SimpleSymbol = {
  name: string;
  value?: string;
  parent?: SimpleSymbol;
  children: SymbolTable;
};
// This is just a "a.b.c"="Something Here" list:
export type FlatTable = Map<string, string>;
// This is the scoped c(b(a)) -> "Something Here" list:
export type SymbolTable = Map<string, SimpleSymbol>;
// A Parsed file is *both* of those things (for no good reason: Why not just a SymbolTable?)
export type ParsedFile = { scopedTable: SymbolTable; flatSymbols: FlatTable };

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
