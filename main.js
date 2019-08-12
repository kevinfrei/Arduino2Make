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
const dumpBoard = require('./board.js');
const dumpPlatform = require('./platform.js');
const dumpProgrammer = require('./programmer.js');

/*::
import type {ParsedFile} from './types.js';
*/

const main = async (board/*:string*/, platform/*:string*/, prog/*:string*/) => {
  const boardSyms = await parseFile(board);
  const platformSyms = await parseFile(platform);
  const progSyms = await parseFile(prog);

  console.log('# This is designed to be included from your own Makefile');
  console.log('#');
  console.log('# Begin general template');
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
  console.log('RUNTIME_IDE_VERSION=10808');
  console.log('IDE_VERSION=10808');
  console.log('# TODO: Check for other vars that the user needs to set');
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

module.exports = main;
