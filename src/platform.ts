import { Type } from '@freik/core-utils';
import { GetNestedChild } from './symbols.js';
import {
  DumbSymTbl,
  ParsedFile,
  Pattern,
  Platform,
  SimpleSymbol,
} from './types.js';

function getString(syms: DumbSymTbl, key: string): string {
  const val = syms.get(key)?.value;
  if (!val) return '';
  return Type.isString(val) ? val : val();
}

function getRequired(tbl: SimpleSymbol, ...args: string[]): string {
  const sym = GetNestedChild(tbl, ...args);
  if (sym === undefined || !Type.isString(sym.value)) {
    throw new Error(
      `Required symbol missing from platform.txt: ${args.join('.')}`,
    );
  }
  return sym.value;
}

// TODO: Add support for the filters
function getPattern(
  tbl: SimpleSymbol,
  key: string,
  patLoc: string[],
  ...filters: string[][]
): Pattern {
  const pattern = getRequired(tbl, ...[key, ...patLoc]);
  const other = new Map<string, SimpleSymbol>();
  return { pattern, other };
}

export function MakePlatform(pf: ParsedFile): Platform {
  const name: string = getString(pf.scopedTable, 'name');
  const version: string = getString(pf.scopedTable, 'version');
  const tools = pf.scopedTable.get('tools');
  const recipes = pf.scopedTable.get('recipe');
  const hooks = recipes?.children.get('hooks')?.children;
  if (Type.isUndefined(recipes)) {
    throw new Error('Missing any recipes from the platform.txt file');
  }
  const symbols = [...pf.scopedTable.entries()];
  const misc = new Map<string, SimpleSymbol>(
    symbols.filter(([val]) => val !== 'tools' && val !== 'recipe'),
  );

  const c = getPattern(recipes, 'c', ['o', 'pattern'], ['combine']);
  const cpp = getPattern(recipes, 'cpp', ['o', 'pattern']);
  const s = getPattern(recipes, 'S', ['o', 'pattern']);
  const ar = getPattern(recipes, 'ar', ['pattern']);
  const link = getPattern(
    recipes,
    'c',
    ['combine', 'pattern'],
    ['o', 'pattern'],
  );
  const skip = new Set(['c', 'cpp', 'S', 'ar', 'hooks']);

  const others = [...recipes.children.values()].filter(
    (ss) => !skip.has(ss.name),
  );
  return {
    name,
    version,
    tools,
    misc,
    hooks,
    recipes: { c, cpp, s, ar, link, others },
  };
}
