import { Type } from '@freik/core-utils';
import { promises as fs } from 'fs';
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

export type Transform = [string, string, string];
// This should grow with time, I think
type Config = {
  transforms: { defs: Transform[] };
};

function isConfig(val: unknown): val is Config {
  if (!Type.isObjectNonNull(val)) {
    return false;
  }
  if (!Type.has(val, 'transforms')) {
    return false;
  }
  if (!Type.isObjectNonNull(val.transforms)) {
    return false;
  }
  if (!Type.has(val.transforms, 'defs')) {
    return false;
  }
  return Type.isArrayOf(
    val.transforms.defs,
    (obj): obj is [string, string, string] =>
      Type.is3TupleOf(obj, Type.isString, Type.isString, Type.isString),
  );
}

async function readConfig(configs: string[]): Promise<Config | undefined> {
  if (configs.length > 1) {
    return;
  }
  if (configs.length === 0) {
    return { transforms: { defs: [] } };
  }
  try {
    const cfg = await fs.readFile(configs[0].substring(9), 'utf-8');
    const json = JSON.parse(cfg) as unknown;
    if (isConfig(json)) {
      return json;
    }
    console.error('Invalid type for config file:');
    console.error(json);
  } catch (e) {
    console.error('Unable to read config file:');
    console.error(e);
  }
}

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

export default async function main(...args: string[]): Promise<void> {
  const normalArgs = args.filter((val) => !val.startsWith('--config:'));
  const config = await readConfig(
    args.filter((val) => val.startsWith('--config:')),
  );
  if (normalArgs.length === 0 || !config) {
    console.error(
      'Usage: {--config:file.json} rootDir {lib1Dir lib2Dir lib3Dir}',
    );
    console.error(
      "  rootDir is where you can find 'boards.txt' and 'platform.txt'",
    );
    return;
  }
  const root = normalArgs[0];
  const libLocs = normalArgs.slice(1);
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
    mkdef('RUNTIME_IDE_VERSION', '10816', [], []),
    mkdef('IDE_VERSION', '10816', [], []),
  ];
  const boardDefined = buildBoard(boardSyms);
  // TODO: Don't have recipes & tools fully handled in the platform yet
  const { defs: platDefs, rules } = buildPlatform(
    boardDefined,
    platSyms,
    platform.substring(0, platform.lastIndexOf('/')),
    libLocs,
  );

  // TODO: Make definitions dependent on their condition values, so that I can
  // put errors in place when mandatory symbols aren't defined before inclusion
  const { checks, defs } = order(
    [...initial, ...boardDefined, ...platDefs],
    rules,
  );
  emitChecks(checks);
  emitDefs(defs, config.transforms.defs);
  emitRules(rules);
}

export function Transform(
  name: string,
  value: string,
  xforms: Transform[],
): { name: string; value: string } {
  for (const [match, search, replace] of xforms) {
    // For now just do a simple "indexOf" for matching, I guess
    if (name.indexOf(match) >= 0) {
      value = value.replace(search, replace);
    }
  }
  return { name, value };
}
