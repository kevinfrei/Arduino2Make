import { Type } from '@freik/core-utils';
import {
  ParsedFile,
  Pattern,
  Platform,
  SimpleSymbol,
  SymbolTable,
} from './types.js';

function getString(syms: SymbolTable, key: string): string {
  const val = syms.get(key)?.value;
  if (!val) return '';
  return Type.isString(val) ? val : val();
}

function getRequired(tbl: SimpleSymbol, ...args: string[]): string {
  let sym: SimpleSymbol | undefined = tbl;
  let i = 0;
  while (sym !== undefined && i < args.length) {
    sym = sym.children.get(args[i]);
    i++;
    if (sym === undefined) {
      throw new Error(
        `Required symbol missing from platform.txt: ${args.join('.')}`,
      );
    }
  }
  if (Type.isString(sym.value)) {
    return sym.value;
  }
  throw new Error(
    `Malformed required symbol from platform.txt: ${args.join('.')}`,
  );
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
  const hooks = recipes?.children.get('hooks');
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

  const others = new Map<string, SimpleSymbol>(
    [...recipes.children.entries()].filter(
      ([val]) => val !== 'c' && val !== 'cpp' && val !== 'S',
    ),
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
