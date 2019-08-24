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
const { definition: def, condition: cond } = require('./mkutil.js');
const buildBoard = require('./board.js');
const buildPlatform = require('./platform.js');
const buildProgrammer = require('./programmer.js');
const {
  order,
  emitChecks,
  emitDefs,
  emitRules
} = require('./postprocessor.js');

import type { ParsedFile, Condition, Definition } from './types.js';

const main = async (board: string, platform: string, prog: string) => {
  const boardSyms = await parseFile(board);
  const platSyms = await parseFile(platform);
  const progSyms = await parseFile(prog);
  const isWin = cond('ifeq', '$(OS)', 'Windows_NT');
  const notWin = cond('ifneq', '$(OS)', 'Windows_NT');
  const isMac = cond('ifeq', '$(uname)', 'Darwin');
  const notMac = cond('ifeq', '$(uname)', 'Darwin');
  const initial = [
    def('RUNTIME_OS', 'windows', [], [isWin]),
    def('uname', '$(shell uname -s)', [], [notWin]),
    def('RUNTIME_OS', 'macosx', ['uname'], [notWin, isMac]),
    def('RUNTIME_OS', 'linux', ['uname'], [notWin, notMac]),
    def('RUNTIME_PLATFORM_PATH', path.resolve(path.dirname(platform)), [], []),
    def('RUNTIME_IDE_VERSION', '10808', [], []),
    def('IDE_VERSION', '10808', [], [])
  ];
  const boardDefined = buildBoard(boardSyms);
  // TODO: Don't have recipes & tools fully handled in the platform yet
  const { defs: platDefined, rules } = buildPlatform(boardDefined, platSyms);
  // Not gonna deal with the programmer stuff yet, as (at least for Adafruit)
  // it seems to be just for burning a new bootloader, not for programming an
  // actual sketch...
  // dumpProgrammer(boardDefined, platDefined, progSyms);

  // TODO: Make definitions dependent on their condition values, so that I can
  // put errors in place when mandatory symbols aren't defined before inclusion
  const { checks, defs } = order(
    [...initial, ...boardDefined, ...platDefined],
    rules
  );
  emitChecks(checks);
  emitDefs(defs);
  emitRules(rules);
};

module.exports = main;
