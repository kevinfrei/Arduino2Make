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
};
// This is the scoped c(b(a)) -> "Something Here" list:
export type DumbSymTbl = Map<string, SimpleSymbol>;
// A better interface for my needs: a "get" that throws with a 'check' that doesn't
// plus a constructor that adds a filter on top, instead of recreating the table

export type SymbolTable = {
  add: (name: string | string[], value: string | SFn) => Sym;
  get: (lkup: string | string[]) => Sym;
  check: (lkup: string | string[]) => Sym | undefined;
  parent: () => Sym | undefined;
  // TODO: Iterators
};
// A parsed file as something fancier than a SymbolTable, mostly for historical reasons
export type ParsedFile = { scopedTable: DumbSymTbl };

export type DependentValue = { value: string; unresolved: Set<string> };

export type FilterFunc = (str: SimpleSymbol) => boolean;
export type ValueMakerFunc = (vrbl: SimpleSymbol) => DependentValue;

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

export type Board = {
  // The 'top level' symbol. This includes the menu options, cuz I'm lazy
  symbols: SimpleSymbol;
  // The list of menu options for this board
  menuSelections: SimpleSymbol[];
};

export type BoardsList = {
  // Each board gets an item in here:
  boards: Map<string, Board>;
  // The list of menu items (with their pleasant names)
  menus: Map<string, string>;
};

export type OldSizeType = {
  program: string;
  data: string;
  pattern: string;
  other: DumbSymTbl;
};

export type Pattern = { pattern: string; other: DumbSymTbl };

export type AllRecipes = {
  // c.o
  c: Pattern;
  // cpp.o
  cpp: Pattern;
  // S.o
  s: Pattern;
  // just 'ar'
  ar: Pattern;
  // c.combine
  link: Pattern;
  // objcopy.<name>
  objcopy: { name: string; pattern: Pattern }[];
  // recipe.size.regex and regex.data
  size: OldSizeType;
  // This is a tool that returns some json blob
  advancedSize?: Pattern;
  // preproc.macros (auto-gen'd from cpp.o if not defined)
  preprocess?: Pattern;
  // preproc.include (optional and old, apparently?)
  include?: Pattern;

  others: SimpleSymbol[];
};

export type AllHooks = {
  prebuild: Pattern[];
  postbuild: Pattern[]; // This one isn't in the spec, but Teensy uses it
  sketchPrebuild: Pattern[];
  skechPostbuild: Pattern[];
  libPrebuild: Pattern[];
  libPostbuild: Pattern[];
  corePrebuild: Pattern[];
  corePostbuild: Pattern[];
  prelink: Pattern[];
  postlink: Pattern[];
  precopy: Pattern[];
  postcopy: Pattern[];
  prehex: Pattern[];
  posthex: Pattern[];
};

export type Platform = {
  name: string;
  version: string;
  tools?: SimpleSymbol;
  misc: DumbSymTbl;
  recipes: AllRecipes;
  hooks: AllHooks;
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

export type BuildSystemHost = {
  emit: (
    platformPath: string,
    platSyms: ParsedFile,
    platform: Platform,
    board: BoardsList,
    libraries: Library[],
  ) => Promise<void>;
  expandName: (nm: string) => { name: string; expansion: string };
  globals: PlatformGlobalFuncs;
};
