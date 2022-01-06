import path from 'path';
import { buildBoard } from './board.js';
import {
  makeDeclDef as mkdef,
  makeIfeq,
  makeIfneq,
  makeUnDecl,
} from './mkutil.js';
import { parseFile } from './parser.js';
import { buildPlatform } from './platform.js';
import { emitChecks, emitDefs, emitRules, order } from './postprocessor.js';

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

export default async function main(
  root: string,
  ...libLocs: string[]
): Promise<void> {
  const board = path.join(root, 'boards.txt');
  const platform = path.join(root, 'platform.txt');
  const boardSyms = await parseFile(board);
  const platSyms = await parseFile(platform);
  const isWin = makeIfeq('$(OS)', 'Windows_NT');
  const notWin = makeIfneq('$(OS)', 'Windows_NT');
  const isMac = makeIfeq('$(uname)', 'Darwin');
  // const notMac = makeIfneq('$(uname)', 'Darwin');
  const initial = [
    mkdef('RUNTIME_OS', 'windows', [], [isWin]),
    mkdef('uname', '$(shell uname -s)', [], [notWin]),
    mkdef('RUNTIME_OS', 'macosx', ['uname'], [notWin, isMac]),
    makeUnDecl('RUNTIME_OS', 'linux', [], []),
    mkdef(
      'RUNTIME_PLATFORM_PATH',
      path.resolve(path.dirname(platform)),
      [],
      [],
    ),
    mkdef('RUNTIME_IDE_VERSION', '10812', [], []),
    mkdef('IDE_VERSION', '10812', [], []),
  ];
  const boardDefined = buildBoard(boardSyms);
  // TODO: Don't have recipes & tools fully handled in the platform yet
  const { defs: platDefined, rules } = buildPlatform(
    boardDefined,
    platSyms,
    platform.substring(0, platform.lastIndexOf('/')),
    libLocs,
  );

  // TODO: Make definitions dependent on their condition values, so that I can
  // put errors in place when mandatory symbols aren't defined before inclusion
  const { checks, defs } = order(
    [...initial, ...boardDefined, ...platDefined],
    rules,
  );
  emitChecks(checks);
  emitDefs(defs);
  emitRules(rules);
}
