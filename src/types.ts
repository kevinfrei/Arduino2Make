export type SFn = () => string;
// The basic types for a parsed file:
export type SimpleSymbol = {
  name: string;
  value?: string | SFn;
  parent?: SimpleSymbol;
  children: DumbSymTbl;
};
export type Sym = {
  name: string;
  value?: string | SFn;
  parent?: SymbolTable;
  children?: SymbolTable;
  // This should just iterator over any children, if there are some...
  [Symbol.iterator](): Iterator<[string, Sym]>;
};
// This is the scoped c(b(a)) -> "Something Here" list:
export type DumbSymTbl = Map<string, SimpleSymbol>;
// A better interface for my needs: a "get" that throws with a 'check' that doesn't
// plus a constructor that adds a filter on top, instead of recreating the table

export interface SymbolTable {
  add: (name: string | string[], value: string | SFn) => Sym;
  get: (lkup: string | string[]) => Sym;
  check: (lkup: string | string[]) => Sym | undefined;
  parent: () => Sym | undefined;
  [Symbol.iterator]: () => Iterator<[string, Sym]>;
}

export type ASymTable = SymbolTable | DumbSymTbl;
export type ASymbol = Sym | SimpleSymbol;

// A parsed file as something fancier than a SymbolTable, mostly for historical reasons
export type ParsedFile = { scopedTable: DumbSymTbl };
export type ParsedSymbols = { symTable: SymbolTable };

export type DependentValue = { value: string; unresolved: Set<string> };

export type FilterFunc<TSym extends ASymbol> = (str: TSym) => boolean;
export type ValueMakerFunc<TSym extends ASymbol> = (
  vrbl: TSym,
) => DependentValue;

export interface Condition {
  op: 'eq' | 'neq' | 'def' | 'ndef' | 'raw';
  variable: string;
  value?: string;
}

export type DependentUpon = {
  dependsOn: string[];
};

export type Definition = DependentUpon & {
  name: string;
  type: 'decl' | 'seq' | 'add' | '?decl';
  value: string;
  condition: Condition[];
};

export type ScopedName = {
  getElement: (index: number) => string;
  getFullName: () => string;
  length: () => number;
};

// Library types:

export type LibDependency = { name: string; ver?: string };
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

export type OptionalLibProps = {
  version: SemVer;
  author: string[];
  maintainer: string;
  sentence: string;
  paragraph: string;
  category: Categories;
  url: string;
  architecture: string;
  depends: LibDependency[];
  staticLink: boolean;
  includes: string[];
  precompiled: boolean | 'full';
  ldflags: string;
};

export type LibProps = Partial<OptionalLibProps> & { name: string };

export type Files = {
  c: string[];
  cpp: string[];
  s: string[];
  inc: string[];
  paths: string[];
  a: string[];
};

export type Library = {
  rootpath: string;
  props: LibProps;
  files: Files;
};

export type Board<TSym extends ASymbol> = {
  // The 'top level' symbol. This includes the menu options, cuz I'm lazy
  symbols: TSym;
  // The list of menu options for this board
  menuSelections: TSym[];
};

export type BoardsList<TSym extends ASymbol> = {
  // Each board gets an item in here:
  boards: Map<string, Board<TSym>>;
  // The list of menu items (with their pleasant names)
  menus: Map<string, string>;
};

export type OldSizeType<TTable extends ASymTable> = {
  program: string;
  data: string;
  pattern: string;
  other: TTable;
};

export type Pattern<TTable extends ASymTable> = {
  pattern: string;
  other: TTable;
};

export type AllRecipes<TTable extends ASymTable, TSym extends ASymbol> = {
  // c.o
  c: Pattern<TTable>;
  // cpp.o
  cpp: Pattern<TTable>;
  // S.o
  s: Pattern<TTable>;
  // just 'ar'
  ar: Pattern<TTable>;
  // c.combine
  link: Pattern<TTable>;
  // objcopy.<name>
  objcopy: { name: string; pattern: Pattern<TTable> }[];
  // recipe.size.regex and regex.data
  size: OldSizeType<TTable>;
  // This is a tool that returns some json blob
  advancedSize?: Pattern<TTable>;
  // preproc.macros (auto-gen'd from cpp.o if not defined)
  preprocess?: Pattern<TTable>;
  // preproc.include (optional and old, apparently?)
  include?: Pattern<TTable>;

  others: TSym[];
};

export type AllHooks<TTable extends ASymTable> = {
  prebuild: Pattern<TTable>[];
  postbuild: Pattern<TTable>[]; // This one isn't in the spec, but Teensy uses it
  sketchPrebuild: Pattern<TTable>[];
  skechPostbuild: Pattern<TTable>[];
  libPrebuild: Pattern<TTable>[];
  libPostbuild: Pattern<TTable>[];
  corePrebuild: Pattern<TTable>[];
  corePostbuild: Pattern<TTable>[];
  prelink: Pattern<TTable>[];
  postlink: Pattern<TTable>[];
  precopy: Pattern<TTable>[];
  postcopy: Pattern<TTable>[];
  prehex: Pattern<TTable>[];
  posthex: Pattern<TTable>[];
};

export type Platform<TTable extends ASymTable, TSym extends ASymbol> = {
  name: string;
  version: string;
  tools?: TSym;
  misc: TTable;
  recipes: AllRecipes<TTable, TSym>;
  hooks: AllHooks<TTable>;
  // upload.maximum_size and upload.maximum_data_size
  maxSize: { program: number; data: number };
};

// These are functions to spit out the platform implementation of global values: N[really]YI!!!
export type PlatformGlobalFuncs = {
  getRuntimePlatformPath: SFn;
  getRuntimeHardwarePath: SFn;
  getRuntimeIdePath: SFn;
  getRuntimeOs: SFn;
  getVendorName: SFn;
  getBoardId: SFn;
  getFQBN: SFn;
  getSourcePath: SFn;
  getLibDiscoveryPhase: SFn;
  getOptFlags: SFn;
  getTimeUtc: (tzAdjust?: boolean, dstAdjust?: boolean) => SFn;
};

export type BuildSystemHost<TTable extends ASymTable, TSym extends ASymbol> = {
  emit: (
    platformPath: string,
    platform: Platform<TTable, TSym>,
    board: BoardsList<TSym>,
    libraries: Library[],
  ) => Promise<void>;
  expandName: (nm: string) => { name: string; expansion: string };
  globals: PlatformGlobalFuncs;
};

// Var def to match, substr to find, string to replace substr with
export type TransformItem = { defmatch: string; text: string; replace: string };

// Var def to match, substring to filter out
export type FilterItem = { defmatch: string; remove: string };

// This should grow with time, I think
export type ConfigChanges = {
  transforms: TransformItem[];
  filters: FilterItem[];
};

export type GnuTargetConfig = {
  target: 'gnumake';
  outputFile: string;
};

export type RunConfig = GnuTargetConfig & {
  root: string;
  libs?: string[];
  configFile?: string;
  changes?: Partial<ConfigChanges>;
};
