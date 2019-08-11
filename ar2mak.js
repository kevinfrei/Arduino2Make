#!/usr/bin/env node
// @flow
// @format

// Overall structure:
// Walk the platform.txt file, documented here:
// https://github.com/arduino/Arduino/wiki/Arduino-IDE-1.5-3rd-party-Hardware-specification
// reading variables, adding their values, and creating Make-compatible versions
// of those variable names

// Once the variables are all handled, there's probably some cookie cutter
// Makefile stuff I need to spit out to build the files

// Get the basics of compiling & linking this stuff to a single .a file done
// Once that's done, then restructre the resulting makefile to be more
// configurable

const fs = require('fs');
const rl = require('readline');
const proc = require('process');
const path = require('path');
const fsp = fs.promises;

/*::

type Variable = {
  name:string,
  value?:string,
  parent:?Variable,
  children:SymbolTable,
};

type SymbolTable = Map<string, Variable>;
type FlatTable = Map<string, string>;
type NamedTable = Map<string, SymbolTable>;
type ParsedFile = { scopedTable:SymbolTable, flatSymbols: FlatTable };

type ResolvedValue = { value:string, unresolved:Set<string> };
*/

const makeFullName = (v/*:Variable*/)/*:string*/ => {
  let res = v.name;
  while (v.parent) {
    v = v.parent;
    res = `${v.name}.${res}`;
  }
  return res;
}

const makeVariable = (
  fullName/*:string*/,
  value/*:string*/,
  table/*:SymbolTable*/
)/*:Variable*/ => {
  const pieces/*:Array<string>*/ = fullName.split('.');
  let ns/*:?Variable*/;
  for (let i = 0; i < pieces.length - 1; i++) {
    const nm/*:string*/ = pieces[i];
    let data = table.get(nm);
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
    console.error("Duplicate symbol definition: " + fullName);
    console.error(table.get(locName));
  }
  const res = { name: locName, parent: ns, value, children: new Map() };
  table.set(locName, res);
  return res;
};

const isComment = (line/*:string*/)/*:boolean*/ => line.trim().startsWith("#");

const isVariable = (
  line/*:string*/,
  table/*:SymbolTable*/,
  flatsyms/*:FlatTable*/
)/*:?Variable*/ => {
  const t = line.trim();
  const eq = t.indexOf('=');
  if (eq < 1) {
    return;
  }
  const fullName = t.substr(0, eq);
  const value = t.substr(eq + 1);
  flatsyms.set(fullName, value);
  return makeVariable(fullName, value, table);
};

// This does what it says it does...
const parseFile = async (filepath/*:string*/)/*:Promise<ParsedFile>*/ => {
  const scopedTable/*:SymbolTable*/ = new Map();
  const flatSymbols/*:FlatTable*/ = new Map();

  const read = rl.createInterface({
    input: fs.createReadStream(filepath),
    output: fs.createWriteStream('/dev/null') // TODO: '\\\\.\\NUL' for windows
  });
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
};

// This takes a value, and returns the resolved value plus the list of
// undefined names within the value
const resolveValue = (
  value/*:string*/,
  parsedFile/*:ParsedFile*/
) /*:ResolvedValue*/ => {
  let res = '';
  let loc = 0;
  let unresolved/*:Set<string>*/ = new Set();
  let flatSymbols = parsedFile.flatSymbols;
  do {
    const newloc = value.indexOf('{', loc);
    if (newloc >= 0) {
      res = res + value.substring(loc, newloc);
      const close = value.indexOf('}', newloc + 1);
      if (close < newloc) {
        return { value: '', unresolved: new Set() };
      }
      const nextSym = value.substring(newloc + 1, close);
      const symVal = flatSymbols.get(nextSym);
      if (!symVal) {
        unresolved.add(nextSym);
        res = `${res}{${nextSym}}`;
      } else {
        // Potentially unbounded recursion here. That would be bad...
        const val = resolveValue(symVal, parsedFile);
        unresolved = new Set([...unresolved, ...val.unresolved]);
        res = res + val.value;
      }
      loc = close + 1;
    } else {
      res = res + value.substr(loc);
      loc = -1;
    }
  } while (loc >= 0);
  return { value: res, unresolved };
};

// Upper-cases with underscores
const getMakeName = (vrbl/*:Variable*/, top/*:Variable*/) => {
  let name = vrbl.name.toUpperCase();
  while (vrbl.parent && vrbl.parent !== top) {
    vrbl = vrbl.parent;
    name = vrbl.name.toUpperCase() + '_' + name;
  }
  return name;
};

// TODO: This should put quotes & backslashes & whatnot
const getMakeValue = (
  vrbl/*:Variable*/,
  parsedFile/*:ParsedFile*/
)/*:string*/ => {
  if (vrbl.value) {
    const res = resolveValue(vrbl.value, parsedFile);
    return res.value;
  } else {
    return '';
  }
};

// top is the root of a 'namespace': We're gonna dump all the children
const dumpMakeVariables = (top/*:Variable*/, parsedFile/*:ParsedFile*/) => {
  let toDump/*:Array<Variable>*/ = [...top.children.values()];
  while (toDump.length > 0) {
    const vrbl/*:Variable*/ = toDump.pop();
    toDump.push(...vrbl.children.values());
    if (vrbl.value) {
      console.log(`\t${getMakeName(vrbl, top)}=${getMakeValue(vrbl, parsedFile)}`);
    }
  }
};

const dumpBoard = (board/*:ParsedFile*/) => {
  let first = true;
  for (let item of board.scopedTable) {
    if (item[0] === 'menu') {
      // This stuff has some other options that we need.
      // TODO: make this do something real, maybe, but for right now,
      // maybe trim it?
      continue;
    }
    console.log(`${first ? 'ifeq' : 'else ifeq'} ($(DEVICE), ${item[0]})`);
    first = false;
    dumpMakeVariables(item[1], board);
  }
  console.log('else');
  console.log('\t$(error Unknown DEVICE target)');
  console.log('endif');
};

const main = async (board/*:string*/, platform/*:string*/, prog/*:string*/) => {
  const boardSyms = await parseFile(board);
  console.log('# This is designed to be included from your own Makefile');
  console.log('# Some general stuff that Arduino may expect');
  console.log('ifeq ($(OS),Windows_NT)');
  console.log('\tRUNTIME_OS=windows');
  console.log('else');
  console.log('\tuname:=$(shell uname -s)');
  console.log('\tifeq ($(uname),Darwin)');
  console.log('\t\tRUNTIME_OS=macos');
  console.log('\telse');
  console.log('\t\tRUNTIME_OS=linux');
  console.log('\tendif');
  console.log('endif');
  console.log(`RUNTIME_PLATFORM_PATH=${path.resolve(path.dirname(platform))}`);
  console.log('# Begin boards stuff');
  dumpBoard(boardSyms);
  console.log('# End boards stuff');
  const platformSyms = await parseFile(platform);
  const progSyms = await parseFile(prog);

  if (0) {
    let unresolved/*:Set<string>*/ = new Set();
    for (let i of boardSyms.flatSymbols) {
      const resVal = resolveValue(i[1], boardSyms);
      unresolved = new Set([...unresolved, ...resVal.unresolved]);
      console.log(`${i[0]}: "${resVal.value}"`);
    }
    console.log([...unresolved].sort());


    const val = flatsyms.get('recipe.objcopy.hex.pattern');
    console.log(val);
    const reso = resolveValue(val);
    console.log(reso);
  }
};

main(process.argv[2], process.argv[3], process.argv[4]).then(a => { });

