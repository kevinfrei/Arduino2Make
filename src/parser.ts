import { Type } from '@freik/core-utils';
import * as fs from 'fs';
import * as rl from 'readline';
import { Dump } from './dump.js';
import { MakeSymbol } from './symbols.js';
import type { DumbSymTbl, ParsedFile } from './types.js';

function isComment(line: string): boolean {
  return line.trim().startsWith('#');
}

function parseVariable(line: string, table: DumbSymTbl): boolean {
  const t = line.trim();
  const eq = t.indexOf('=');
  /* istanbul ignore if */
  if (eq < 1) {
    return false;
  }
  const fullName = t.substring(0, eq);
  const value = t.substring(eq + 1);
  return !Type.isUndefined(MakeSymbol(fullName, value, table));
}

// Read in the text file, and spit out the parsed file
export async function ParseFile(filepath: string): Promise<ParsedFile> {
  const scopedTable: DumbSymTbl = new Map();

  const read = rl.createInterface({ input: fs.createReadStream(filepath) });
  let num = 0;
  for await (const line of read) {
    num++;
    if (isComment(line) || line.trim().length === 0) {
      continue;
    }
    // Read the variables one by one
    /* istanbul ignore if */
    if (!parseVariable(line, scopedTable)) {
      Dump('err')(`Error ${num}: ${line}`);
    }
  }
  return { scopedTable };
}
