import { SafelyUnpickle, Type } from '@freik/core-utils';
import { promises as fs } from 'fs';
import path from 'path';
import { buildBoard } from './board.js';
import { parseFile } from './parser.js';
import { buildPlatform } from './platform.js';
import { Emit } from './targets/makefile.js';

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
    ['text', Type.isString],
    ['replace', Type.isString],
  ],
  ['defmatch', 'text', 'replace'],
);
const isFilterItem = Type.isSpecificTypeFn<FilterItem>(
  [
    ['defmatch', Type.isString],
    ['remove', Type.isString],
  ],
  ['defmatch', 'remove'],
);
function isConfig(i: unknown): i is Partial<Config> {
  return (
    Type.hasType(i, 'transforms', Type.isArrayOfFn(isTransformItem)) ||
    Type.hasType(i, 'filters', Type.isArrayOfFn(isFilterItem))
  );
}

let outputFile: string[] | undefined;
let outputName: string | undefined;

function openOutputFile(args: string[]): string[] {
  const res = args.filter((val) => !val.startsWith('--out:'));
  if (res.length !== args.length) {
    const outName = args.find((val) => val.startsWith('--out:'));
    outputName = outName?.substring(6);
    outputFile = [];
  }
  return res;
}

function dumpToFile(message: unknown): void {
  if (outputFile !== undefined && Type.isString(message)) {
    outputFile.push(message);
  }
}

// Eventually, we can dump stuff into different files, right?
export function dump(which?: string): (message: unknown) => void {
  switch (which) {
    case undefined:
    case 'log':
      return Type.isUndefined(outputFile) ? console.log : dumpToFile; // eslint-disable-line no-console
    case 'err':
      return console.error; // eslint-disable-line no-console
    default:
      return (msg) => {
        // eslint-disable-next-line no-console
        console.error(which, ' is an invalid selector: ', msg);
      };
  }
}

async function readConfig(
  configs: string[],
): Promise<Partial<Config> | undefined> {
  if (configs.length === 1) {
    try {
      const cfg = await fs.readFile(configs[0].substring(9), 'utf-8');
      const json = SafelyUnpickle(cfg, isConfig);
      if (Type.isUndefined(json)) {
        dump('err')('Invalid type for config file:');
        dump('err')(json);
      }
      return json;
    } catch (e) {
      dump('err')('Unable to read config file:');
      dump('err')(e);
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
  const noConfig = args.filter((val) => !val.startsWith('--config:'));
  config = await readConfig(args.filter((val) => val.startsWith('--config:')));
  const normalArgs = openOutputFile(noConfig);

  if (normalArgs.length === 0 && config === undefined) {
    dump('err')(
      'Usage: {--config:file.json} {--out:<filename>} rootDir {lib1Dir lib2Dir lib3Dir}',
    );
    dump('err')(
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
  const boardDefined = buildBoard(boardSyms);

  // TODO: Don't have recipes & tools fully handled in the platform yet
  const { defs: platDefs, rules } = await buildPlatform(
    boardDefined,
    platSyms,
    path.dirname(platform),
    libLocs,
  );

  Emit(platform, boardDefined, platDefs, rules);

  if (!Type.isUndefined(outputFile) && Type.isString(outputName)) {
    await fs.writeFile(outputName, outputFile.join('\n'), 'utf-8');
  }
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
