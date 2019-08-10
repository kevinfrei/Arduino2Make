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
const fsp = fs.fsPromise;

/*::
type Variable = {
  name:string,
  value?:string
  parent:?Namespace
  children?:?SymbolTable,
};
type SymbolTable = Map<string, Variable>;
type FlatTable = Map<string, string>;

type ResolvedValue = {
  value:string,
  unresolved:Set<string>
};
*/

const symbols/*:SymbolTable*/ = new Map();
const flatsyms/*:FlatTable*/ = new Map();

const makeFullName = (v/*:Variable*/)/*:string*/ => {
  let res = v.name;
  while (v.parent) {
    v = v.parent;
    res = `${v.name}.${res}`;
  }
  return res;
}

const makeVariable = (fullName/*:string*/, value/*:string*/)/*:Variable*/ => {
  const pieces/*:Array<string>*/ = fullName.split('.');
  let table = symbols;
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
  flatsyms.set(fullName, value);
  return res;
};

const isComment = (line/*:string*/)/*:boolean*/ => line.trim().startsWith("#");

const isVariable = (line/*:string*/)/*:?Variable*/ => {
  const t = line.trim();
  const eq = t.indexOf('=');
  if (eq < 1) {
    return;
  }
  return makeVariable(t.substr(0, eq), t.substr(eq + 1));
};

// This does what it says it does...
const parseFile = async (filepath/*:string*/) => {
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
    if (!isVariable(line)) {
      console.log(`Error ${num}: ${line}`);
    }
  }
};

// This looks up a full name in the table
const lookup = (name/*:string*/) /*:?string*/ => {
  return flatsyms.get(name);
};

// This takes a value, and returns the resolved value plus the list of
// undefined names within the value
const resolveValue = (value/*:string*/) /*:ResolvedValue*/ => {
  let res = '';
  let loc = 0;
  let unresolved/*:Set<string>*/ = new Set();
  do {
    const newloc = value.indexOf('{', loc);
    if (newloc >= 0) {
      res = res + value.substring(loc, newloc);
      const close = value.indexOf('}', newloc + 1);
      if (close < newloc) {
        return { value: '', unresolved: new Set() };
      }
      const nextSym = value.substring(newloc + 1, close);
      const symVal = lookup(nextSym);
      if (!symVal) {
        unresolved.add(nextSym);
        res = `${res}{${nextSym}}`;
      } else {
        // Potentially unbounded recursion here. That would be bad...
        const val = resolveValue(symVal);
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

const main = async (files/*:Array<string>*/) => {
  for (let file of files) {
    await parseFile(file);
  }
  let unresolved/*:Set<string>*/ = new Set();
  for (let i of flatsyms) {
    const resVal = resolveValue(i[1]);
    unresolved = new Set([...unresolved, ...resVal.unresolved]);
    console.log(`${i[0]}: "${resVal.value}"`);
  }
  console.log([...unresolved].sort());
  /*
    const val = flatsyms.get('recipe.objcopy.hex.pattern');
    console.log(val);
    const reso = resolveValue(val);
    console.log(reso);*/
};

main(process.argv.slice(2)).then(a => console.log('done'));
