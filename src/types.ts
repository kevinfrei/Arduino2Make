export type Variable = {
  name: string;
  value?: string;
  parent: Variable | null;
  children: SymbolTable;
};

export type SymbolTable = Map<string, Variable>;
export type FlatTable = Map<string, string>;
export type NamedTable = Map<string, SymbolTable>;
export type ParsedFile = { scopedTable: SymbolTable; flatSymbols: FlatTable };
export type DependentValue = { value: string; unresolved: Set<string> };

export type FilterFunc = (str: Variable) => boolean;
export type ValueMakerFunc = (
  vrbl: Variable,
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
  op: 'eq' | 'neq' | 'def' | 'ndef';
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
