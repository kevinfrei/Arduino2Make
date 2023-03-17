import { isUndefined } from '@freik/typechk';
import * as fs from 'node:fs';
import * as rl from 'node:readline';

import { Dump } from './dump';
import { MakeSymbol, MakeSymbolTable } from './symbols';
import type {
  DumbSymTbl,
  ParsedFile,
  ParsedSymbols,
  SymbolTable,
} from './types';

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
  return !isUndefined(MakeSymbol(fullName, value, table));
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

function parseVar(line: string, table: SymbolTable): boolean {
  const t = line.trim();
  const eq = t.indexOf('=');
  /* istanbul ignore if */
  if (eq < 1) {
    return false;
  }
  const fullName = t.substring(0, eq);
  const value = t.substring(eq + 1);
  return !isUndefined(table.add(fullName, value));
}

// Read in the text file, and spit out the parsed file
export async function ParseSymbolTable(
  filepath: string,
): Promise<ParsedSymbols> {
  const symTable = MakeSymbolTable();

  const read = rl.createInterface({ input: fs.createReadStream(filepath) });
  let num = 0;
  for await (const line of read) {
    num++;
    if (isComment(line) || line.trim().length === 0) {
      continue;
    }
    // Read the variables one by one
    /* istanbul ignore if */
    if (!parseVar(line, symTable)) {
      Dump('err')(`Error ${num}: ${line}`);
    }
  }
  return { symTable };
}
