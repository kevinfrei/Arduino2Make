// @flow
// @format

export type Variable = {
  name:string,
  value?:string,
  parent:?Variable,
  children:SymbolTable,
};

export type SymbolTable = Map<string, Variable>;
export type FlatTable = Map<string, string>;
export type NamedTable = Map<string, SymbolTable>;
export type ParsedFile = { scopedTable:SymbolTable, flatSymbols: FlatTable };

export type ResolvedValue = { value:string, unresolved:Set<string> };
export type FilterFunc = (string:Variable) => boolean;
