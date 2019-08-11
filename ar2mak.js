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

const path = require('path');

const parseFile = require('./parser.js');
const mkutil = require('./mkutil.js');

/*::
import type {
  Variable, SymbolTable, FlatTable, NamedTable, ParsedFile,
  ResolvedValue, FilterFunc} from './types.js';
*/

const dumpHeader = (platform/*:string*/) => {
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
};

// This spits out the board configuration data in Makefile format
// It returns the set of *probably* defined variables, for use later
// TODO: Handle the !@#$ dependency in the Adafruit board.txt on platform.txt
const dumpBoard = (board/*:ParsedFile*/)/*:Set<string>*/ => {
  let first = true;
  let menus/*:Set<string>*/ = new Set();
  let defined/*:Set<string>*/ = new Set();
  for (let item of board.scopedTable.values()) {
    if (item.name === 'menu') {
      // AFAICT, top level 'menu' items indicate later nested options
      const children = item.children;
      menus = new Set([...menus, ...children.keys()]);
    } else {
      console.log(`${first ? 'ifeq' : 'else ifeq'} ($(INPUT_BOARD), ${item.name})`);
      first = false;
      const defVars = mkutil.dumpVars('\t', item, board, a => a.name !== 'menu');
      const defMore = mkutil.dumpMenuOptions(item, board, menus);
      defined = new Set([...defined, ...defVars, ...defMore]);
    }
  }
  if (!first) {
    console.log('else');
    console.log('\t$(error Unknown or undefined INPUT_BOARD target)');
    console.log('endif');
  }
  return defined;
};

// This generates the rules & whatnot for the platform data
// This is the 'meat' of the whole thing, as recipes generate very different
// Makefile code.
// It also returns the set of probably defined values generated from this code
const dumpPlatform = (
  board/*:Set<string>*/,
  platform/*:ParsedFile*/
)/*:Set<string>*/ => {
  console.log('# TODO: generate Platform stuff!');
/*  console.log(board);
  console.log(platform);*/
  return new Set();
};

// Not sure if I need to deal with this stuff
// Adafruit, this is just bootloader crap, so I haven't done anything for it
const dumpProgrammer = (
  board/*:Set<string>*/,
  platform/*:Set<string>*/,
  programmer/*:ParsedFile*/
) => {
  console.log('# TODO: maybe generate Programmer stuff?');
  //  console.log(programmer);
};

const main = async (board/*:string*/, platform/*:string*/, prog/*:string*/) => {
  const boardSyms = await parseFile(board);
  const platformSyms = await parseFile(platform);
  const progSyms = await parseFile(prog);

  console.log('# This is designed to be included from your own Makefile');
  console.log('#');
  console.log('# Begin general template');
  dumpHeader(platform);
  console.log('# End general template');
  console.log('#');
  console.log('# Begin boards stuff');
  const boardDefined = dumpBoard(boardSyms);
  console.log('# End boards stuff');
  console.log('#');
  console.log('# Begin platform stuff');
  const platDefined = dumpPlatform(boardDefined, platformSyms);
  console.log('# End platform stuff');
  console.log('#');
  console.log('# Begin programmer stuff');
  dumpProgrammer(boardDefined, platDefined, progSyms);
  console.log('# End programmer stuff');
  if (0) {
    /*
    let unresolved = new Set();
    for (let i of boardSyms.flatSymbols) {
      const resVal = mkutil.resolve(i[1], boardSyms);
      unresolved = new Set([...unresolved, ...resVal.unresolved]);
      console.log(`${i[0]}: "${resVal.value}"`);
    }
    console.log([...unresolved].sort());


    const val = flatsyms.get('recipe.objcopy.hex.pattern');
    console.log(val);
    const reso = mkutil.resolve(val);
    console.log(reso);*/
  }
};

main(process.argv[2], process.argv[3], process.argv[4]).then(a => { });

