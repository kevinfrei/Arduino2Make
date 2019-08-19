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

export type Condition = { op: string, variable: string, value: string };
export type Definition = {
  name: string,
  value: string,
  dependsOn: Array<string>,
  condition?: Condition | 'default'
};

export type Recipe = {
  src: string,
  dst: string,
  pattern: string,
  dependsOn: Array<string>
};
