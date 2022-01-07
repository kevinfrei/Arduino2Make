import * as fs from 'fs';
import * as rl from 'readline';
import type { FlatTable, ParsedFile, SymbolTable, Variable } from './types.js';
/* eslint-disable no-console */

// Parsing stuff goes here

/*
const makeFullName = (v: Variable): string => {
  let res = v.name;
  while (v.parent) {
    v = v.parent;
    res = `${v.name}.${res}`;
  }
  return res;
};
*/

function makeVariable(
  fullName: string,
  value: string,
  table: SymbolTable,
): Variable {
  const pieces: string[] = fullName.split('.');
  let ns: Variable | null = null;
  for (let i = 0; i < pieces.length - 1; i++) {
    const nm: string = pieces[i];
    const data = table.get(nm);
    if (data) {
      ns = data;
      table = data.children;
    } else {
      ns = { name: nm, children: new Map(), parent: ns };
      table.set(nm, ns);
      table = ns.children;
    }
  }
  const locName = pieces[pieces.length - 1];
  if (table.get(locName)) {
    console.error('Duplicate symbol definition: ' + fullName);
    console.error(table.get(locName));
  }
  const res = { name: locName, parent: ns, value, children: new Map() };
  table.set(locName, res);
  return res;
}

const isComment = (line: string): boolean => {
  return line.trim().startsWith('#');
};

const isVariable = (
  line: string,
  table: SymbolTable,
  flatsyms: FlatTable,
): Variable | void => {
  const t = line.trim();
  const eq = t.indexOf('=');
  if (eq < 1) {
    return;
  }
  const fullName = t.substring(0, eq);
  const value = t.substring(eq + 1);
  flatsyms.set(fullName, value);
  return makeVariable(fullName, value, table);
};

// This does what it says it does...
export async function parseFile(filepath: string): Promise<ParsedFile> {
  const scopedTable: SymbolTable = new Map();
  const flatSymbols: FlatTable = new Map();

  const read = rl.createInterface({ input: fs.createReadStream(filepath) });
  let num = 0;
  for await (const line of read) {
    num++;
    if (isComment(line) || line.trim().length === 0) {
      continue;
    }
    // Read the variables one by one
    if (!isVariable(line, scopedTable, flatSymbols)) {
      console.log(`Error ${num}: ${line}`);
    }
  }
  return { scopedTable, flatSymbols };
}
