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
*/

const symbols/*:SymbolTable*/ = new Map();

const fullName = (v/*:Variable*/)/*:string*/ => {
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
}
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
  console.log(symbols);
};

parseFile(process.argv[2]).then(a => console.log('done'));
