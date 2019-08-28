// @flow
// @format

export type Variable = {
  name: string,
  value?: string,
  parent: ?Variable,
  children: SymbolTable
};

export type SymbolTable = Map<string, Variable>;
export type FlatTable = Map<string, string>;
export type NamedTable = Map<string, SymbolTable>;
export type ParsedFile = { scopedTable: SymbolTable, flatSymbols: FlatTable };
export type DependentValue = { value: string, unresolved: Set<string> };

export type FilterFunc = (str: Variable) => boolean;
export type ValueMakerFunc = (
  vrbl: Variable,
  file: ParsedFile
) => DependentValue;

export type CondEq = { op: 'eq' | 'neq', variable: string, value: string };
export type CondDef = { op: 'def' | 'ndef', variable: string };
export type Condition = CondEq | CondDef;

export type Definition = {
  name: string,
  type: 'decl' | 'seq' | 'add' | '?decl',
  value: string,
  dependsOn: Array<string>,
  condition: Array<Condition>
};

export type Recipe = {
  src: string,
  dst: string,
  command: string,
  dependsOn: Array<string>
};
