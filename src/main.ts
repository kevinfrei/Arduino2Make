import { MakeError, Type } from '@freik/core-utils';
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

const err = MakeError();

// Var def to match, substr to find, string to replace substr with
type TransformItem = { defmatch: string; text: string; replace: string };
// Var def to match, substring to filter out
type FilterItem = { defmatch: string; remove: string };

// This should grow with time, I think
type Config = {
  transforms: TransformItem[];
  filters: FilterItem[];
};

const isTransformItem = Type.isSpecificTypeFn<TransformItem>(
  [
    ['defmatch', Type.isString],
    ['remove', Type.isString],
  ],
  ['defmatch', 'remove'],
);
const isFilterItem = Type.isSpecificTypeFn<FilterItem>(
  [
    ['defmatch', Type.isString],
    ['text', Type.isString],
    ['replace', Type.isString],
  ],
  ['defmatch', 'text', 'replace'],
);
const isProbablyConfig = Type.isSpecificTypeFn<Partial<Config>>([
  ['transforms', isTransformItem],
  ['filters', isFilterItem],
]);
function isConfig(i: unknown): i is Partial<Config> {
  return (
    isProbablyConfig(i) && (Type.has(i, 'transforms') || Type.has(i, 'filters'))
  );
}

async function readConfig(
  configs: string[],
): Promise<Partial<Config> | undefined> {
  if (configs.length === 1) {
    try {
      const cfg = await fs.readFile(configs[0].substring(9), 'utf-8');
      const json = JSON.parse(cfg) as unknown;
      if (isConfig(json)) {
        return json;
      }
      err('Invalid type for config file:');
      err(json);
    } catch (e) {
      err('Unable to read config file:');
      err(e);
    }
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
let config: Partial<Config> | undefined;

export default async function main(...args: string[]): Promise<void> {
  const normalArgs = args.filter((val) => !val.startsWith('--config:'));
  config = await readConfig(args.filter((val) => val.startsWith('--config:')));
  if (normalArgs.length === 0 || config === undefined) {
    err('Usage: {--config:file.json} rootDir {lib1Dir lib2Dir lib3Dir}');
    err("  rootDir is where you can find 'boards.txt' and 'platform.txt'");
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
    makeUnDecl('RUNTIME_OS', 'linux'),
    mkdef(
      'RUNTIME_PLATFORM_PATH',
      path.dirname(platform).replaceAll('\\', '/'),
    ),
    mkdef('RUNTIME_IDE_VERSION', '10819'),
    mkdef('IDE_VERSION', '10819'),
  ];
  const boardDefined = buildBoard(boardSyms);
  // TODO: Don't have recipes & tools fully handled in the platform yet
  const { defs: platDefs, rules } = buildPlatform(
    boardDefined,
    platSyms,
    path.dirname(platform),
    libLocs,
  );

  // TODO: Make definitions dependent on their condition values, so that I can
  // put errors in place when mandatory symbols aren't defined before inclusion
  const { checks, defs } = order(
    [...initial, ...boardDefined, ...platDefs],
    rules,
  );
  emitChecks(checks);
  emitDefs(defs);
  emitRules(rules);
}

export function Transform(
  name: string,
  value: string,
): { name: string; value: string } {
  if (!config || !Type.hasType(config, 'transforms', Type.isArray)) {
    return { name, value };
  }
  for (const { defmatch, text, replace } of config.transforms) {
    // For now just do a simple "indexOf" for matching, I guess
    if (name.indexOf(defmatch) >= 0) {
      value = value.replace(text, replace);
    }
  }
  return { name, value };
}

export function Filter(name: string, files: string[]): string[] {
  if (!config || !Type.hasType(config, 'filters', Type.isArray)) {
    return files;
  }
  for (const { defmatch, remove } of config.filters) {
    if (name === defmatch) {
      files = files.filter((val) => val.indexOf(remove) < 0);
    }
  }
  return files;
}
