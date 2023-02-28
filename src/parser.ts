import { Type } from '@freik/core-utils';
import * as fs from 'fs';
import * as rl from 'readline';
import { dump } from './main.js';
import { makeSymbol } from './symbols.js';
import type { ParsedFile, SymbolTable } from './types.js';

function isComment(line: string): boolean {
  return line.trim().startsWith('#');
}

export function parseVariable(line: string, table: SymbolTable): boolean {
  const t = line.trim();
  const eq = t.indexOf('=');
  if (eq < 1) {
    return false;
  }
  const fullName = t.substring(0, eq);
  const value = t.substring(eq + 1);
  return !Type.isUndefined(makeSymbol(fullName, value, table));
}

// Read in the text file, and spit out the parsed file
export async function parseFile(filepath: string): Promise<ParsedFile> {
  const scopedTable: SymbolTable = new Map();

  const read = rl.createInterface({ input: fs.createReadStream(filepath) });
  let num = 0;
  for await (const line of read) {
    num++;
    if (isComment(line) || line.trim().length === 0) {
      continue;
    }
    // Read the variables one by one
    if (!parseVariable(line, scopedTable)) {
      dump('err')(`Error ${num}: ${line}`);
    }
  }
  return { scopedTable };
}
