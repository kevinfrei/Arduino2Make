import { isString, isUndefined } from '@freik/typechk';

import { GetNestedChild } from './symbols.js';
import {
  AllHooks,
  AllRecipes,
  DumbSymTbl,
  OldSizeType,
  ParsedFile,
  Pattern,
  Platform,
  SimpleSymbol,
} from './types.js';

function getString(syms: DumbSymTbl, key: string): string {
  const val = syms.get(key)?.value;
  if (!val) return '';
  return isString(val) ? val : val();
}

function getRequiredSym(tbl: SimpleSymbol, ...args: string[]): SimpleSymbol {
  const sym = GetNestedChild(tbl, ...args);
  if (isUndefined(sym)) {
    throw new Error(
      `Required symbol missing from platform.txt: ${args.join('.')}`,
    );
  }
  return sym;
}

function getRequired(tbl: SimpleSymbol, ...args: string[]): string {
  const sym = getRequiredSym(tbl, ...args);
  if (!isString(sym.value)) {
    throw new Error(
      `Required symbol missing from platform.txt: ${args.join('.')}`,
    );
  }
  return sym.value;
}

function getPattern(tbl: SimpleSymbol, ...patLoc: string[]): Pattern {
  const theSym = getRequiredSym(tbl, ...patLoc);
  const pattern = getRequired(theSym, 'pattern');
  return { pattern, other: getOther(theSym, 'pattern') };
}

function getMaybePattern(
  tbl: SimpleSymbol,
  ...patLoc: string[]
): Pattern | undefined {
  const theSym = GetNestedChild(tbl, ...patLoc);
  if (isUndefined(theSym)) {
    return;
  }
  const pattern = getRequired(theSym, 'pattern');
  return { pattern, other: getOther(theSym, 'pattern') };
}

function getPreproc(
  tbl: SimpleSymbol,
  ...patLoc: string[]
): Pattern | undefined {
  const theSym = GetNestedChild(tbl, ...patLoc);
  if (isUndefined(theSym) || !isString(theSym.value)) {
    return;
  }
  const pattern = theSym.value;
  return { pattern, other: getOther(theSym) };
}

function getObjCopyTargets(
  tbl: SimpleSymbol,
): { name: string; pattern: Pattern }[] {
  const theSym = getRequiredSym(tbl, 'objcopy');
  return [...theSym.children.entries()].map(([name, sym]) => ({
    name,
    pattern: {
      pattern: getRequired(sym, 'pattern'),
      other: getOther(sym, 'pattern'),
    },
  }));
}

function getOther(sym: SimpleSymbol, ...skips: string[]): DumbSymTbl {
  const nope = new Set<string>(skips);
  return new Map<string, SimpleSymbol>(
    [...sym.children.entries()].filter(([val]) => !nope.has(val)),
  );
}

function getOldSize(tbl: SimpleSymbol): OldSizeType {
  const sz = tbl.children.get('size');
  const res = {
    program: '',
    data: '',
    pattern: '',
    other: new Map(),
  };
  if (isUndefined(sz)) {
    return res;
  }
  res.pattern = getRequired(sz, 'pattern');
  const rgx = getRequiredSym(sz, 'regex');
  res.program = isString(rgx.value) ? rgx.value : '';
  res.data = getRequired(rgx, 'data');
  res.other = getOther(sz, 'data');
  return res;
}

const recipeSkip = new Set([
  'c',
  'cpp',
  'S',
  'ar',
  'hooks',
  'objcopy',
  'size',
  'advanced_size',
  'preproc',
]);

// Just broken out to keep it in a single place...
function getRecipes(recipeSymbol: SimpleSymbol): AllRecipes {
  // The .O producers:
  const c = getPattern(recipeSymbol, 'c', 'o');
  const cpp = getPattern(recipeSymbol, 'cpp', 'o');
  const s = getPattern(recipeSymbol, 'S', 'o');
  // Static link:
  const ar = getPattern(recipeSymbol, 'ar');
  // Image link:
  const link = getPattern(recipeSymbol, 'c', 'combine');
  // ObjCopy targets:
  const objcopy = getObjCopyTargets(recipeSymbol);
  const size = getOldSize(recipeSymbol);
  const advancedSize = getMaybePattern(recipeSymbol, 'advanced_size');
  const preprocess = getPreproc(recipeSymbol, 'preproc', 'macros');
  const include = getPreproc(recipeSymbol, 'preproc', 'includes');
  const others = [...recipeSymbol.children.values()].filter(
    (ss) => !recipeSkip.has(ss.name),
  );
  return {
    c,
    cpp,
    s,
    ar,
    link,
    objcopy,
    size,
    advancedSize,
    preprocess,
    include,
    others,
  };
}

function fleshOutHooks(val: Partial<AllHooks>): AllHooks {
  return {
    prebuild: val.prebuild || [],
    postbuild: val.postbuild || [],
    sketchPrebuild: val.sketchPrebuild || [],
    skechPostbuild: val.skechPostbuild || [],
    libPrebuild: val.libPrebuild || [],
    libPostbuild: val.libPostbuild || [],
    corePrebuild: val.corePrebuild || [],
    corePostbuild: val.corePostbuild || [],
    prelink: val.prelink || [],
    postlink: val.postlink || [],
    precopy: val.precopy || [],
    postcopy: val.postcopy || [],
    prehex: val.prehex || [],
    posthex: val.posthex || [],
  };
}

function getHook(sym: SimpleSymbol, ...names: string[]): Pattern[] | undefined {
  const child = GetNestedChild(sym, ...names);
  if (isUndefined(child)) {
    return;
  }
  const res: Pattern[] = [];
  child.children.forEach((val, key) => {
    const index = Number.parseInt(key, 10);
    // Ah, NaN, you're my favorite Not-a-Number...
    if (index === index) {
      res[index] = getPattern(val);
    }
  });
  return res;
}

function getHooks(hooks?: SimpleSymbol): AllHooks {
  const res: Partial<AllHooks> = {};
  if (isUndefined(hooks)) {
    return fleshOutHooks(res);
  }
  res.prebuild = getHook(hooks, 'prebuild');
  res.postbuild = getHook(hooks, 'postbuild');
  res.sketchPrebuild = getHook(hooks, 'sketch', 'prebuild');
  res.skechPostbuild = getHook(hooks, 'sketch', 'postbuild');
  res.libPrebuild = getHook(hooks, 'libraries', 'prebuild');
  res.libPostbuild = getHook(hooks, 'libriaries', 'postbuild');
  res.corePrebuild = getHook(hooks, 'core', 'prebuild');
  res.corePostbuild = getHook(hooks, 'core', 'postbuild');
  res.prelink = getHook(hooks, 'linking', 'prelink');
  res.postlink = getHook(hooks, 'linking', 'postlink');
  res.precopy = getHook(hooks, 'objcopy', 'preobjcopy');
  res.postcopy = getHook(hooks, 'objcopy', 'postobjcopy');
  res.prehex = getHook(hooks, 'savehex', 'presavehex');
  res.posthex = getHook(hooks, 'savehex', 'postsavehex');
  return fleshOutHooks(res);
}

function getRecipesAndHooks(recipeSymbol?: SimpleSymbol): {
  recipes: AllRecipes;
  hooks: AllHooks;
} {
  if (isUndefined(recipeSymbol)) {
    throw new Error('No recipes in platform.txt file. Unable to continue.');
  }
  const recipes = getRecipes(recipeSymbol);
  const hooks = getHooks(recipeSymbol.children.get('hooks'));
  return { recipes, hooks };
}

export function MakePlatform(pf: ParsedFile): Platform {
  const name: string = getString(pf.scopedTable, 'name');
  const version: string = getString(pf.scopedTable, 'version');
  const patterns = getRecipesAndHooks(pf.scopedTable.get('recipe'));
  const tools = pf.scopedTable.get('tools');
  const symbols = [...pf.scopedTable.entries()];
  const misc = new Map<string, SimpleSymbol>(
    symbols.filter(([val]) => val !== 'tools' && val !== 'recipe'),
  );

  return {
    ...patterns,
    name,
    version,
    tools,
    misc,
    maxSize: { program: -1, data: -1 },
  };
}
