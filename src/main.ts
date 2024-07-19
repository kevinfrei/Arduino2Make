import {
  hasFieldType,
  hasStrField,
  isNumber,
  isString,
  isUndefined,
} from '@freik/typechk';
import minimist from 'minimist';
import path from 'path';
import { EnumerateBoards } from './board.js';
import { AddConfig, LoadConfig } from './config.js';
import { Dump, FlushOutput, SetOutputFile } from './dump.js';
import { GetLibraries } from './libraries.js';
import { ParseFile } from './parser.js';
import { MakePlatform } from './platform.js';
import { GetTarget } from './utils.js';

// Overall structure:
// Walk the platform.txt file, documented here:
// https://arduino.github.io/arduino-cli/platform-specification/
// reading variables, adding their values, and creating Make-compatible versions
// of those variable names

// Once the variables are all handled, there's probably some cookie cutter
// Makefile stuff I need to spit out to build the files

// Get the basics of compiling & linking this stuff to a single .a file done
// Once that's done, then restructre the resulting makefile to be more
// configurable

function ShowHelp(message?: string | string[]) {
  if (!isUndefined(message)) {
    const msg = isString(message) ? [message] : message;
    msg.forEach(Dump('err'));
    Dump('err')('');
  }
  Dump('err')(`
Usage: {flags} rootDir {lib1Dir lib2Dir lib3Dir}
  rootDir is where you can find 'boards.txt' and 'platform.txt'
  flags:
    --config|-c <file.json> Read the config from the json file
    --out|-o <filename> Spit the output into filename
    --target|-t <gnumake> Generate a project for the given target (only GNUMake currently...)
`);
  process.exit(0);
}

// Var def to match, substr to find, string to replace substr with
export type TransformItem = { defmatch: string; text: string; replace: string };
// Var def to match, substring to filter out
export type FilterItem = { defmatch: string; remove: string };

// This should grow with time, I think
export type Config = {
  transforms: TransformItem[];
  filters: FilterItem[];
};

export type RunConfig = {
  configFile?: string;
  config?: Partial<Config>;
  outputFile?: string;
  target?: 'gnumake';
  root: string;
  libs?: string[];
};

function parseCommandLine(args: string[]): RunConfig {
  const argv = minimist(args, {
     
    string: ['config', 'target', 'out', 'help'],
     
    alias: { c: 'config', t: 'target', o: 'out', h: 'help', '?': 'help' },
    default: { target: 'gnumake' },
  });
  if (hasStrField(argv, 'help')) {
    ShowHelp();
  }
  const configFile = hasStrField(argv, 'config') ? argv.config : undefined;
  // await ReadConfig(argv.config);
  const outputFile = hasStrField(argv, 'out') ? argv.out : undefined;
  const target =
    hasStrField(argv, 'target') && argv.target.toLocaleLowerCase() === 'gnumake'
      ? 'gnumake'
      : undefined;
  const root = argv._[0];
  const libs = argv._.slice(1);
  if (
    hasStrField(argv, 'target') &&
    argv.target.toLocaleLowerCase() !== 'gnumake'
  ) {
    throw Error(`Command line error: Unsupported target ${argv.target}`);
  }
  return { configFile, outputFile, target, root, libs };
}

async function applyConfig(config: RunConfig): Promise<void> {
  if (config.configFile) {
    await LoadConfig(config.configFile);
  }
  if (config.config) {
    AddConfig(config.config);
  }
  if (config.outputFile) {
    SetOutputFile(config.outputFile);
  }
  if (config.target) {
    // TODO: Do something here when we have more than one possible target
  }
}

export async function generate(config: RunConfig): Promise<void> {
  try {
    await applyConfig(config);
    const { root, libs } = config;
    // Parse the input files
    const boardPath = path.join(root, 'boards.txt');
    const boards = EnumerateBoards(await ParseFile(boardPath));
    const platformPath = path.join(root, 'platform.txt');
    const platform = MakePlatform(await ParseFile(platformPath));
    // Scan the libraries:
    // TODO: Move Defs from Library into platformtTarget
    const libraries = libs ? await GetLibraries(root, libs) : [];

    // const globals = MakeGlobals(buildSysTarget);

    // Emit the build stuff:
    await GetTarget().emit(platformPath, platform, boards, libraries);

    // Flush the output to disk...
    await FlushOutput();
  } catch (e) {
    const name = hasStrField(e, 'name') ? e.name : '<unknown>';
    const message = hasStrField(e, 'message') ? e.message : '<no message>';
    const file = hasStrField(e, 'fileName') ? e.fileName : '<no filename>';
    const line = hasFieldType(e, 'lineNumber', isNumber) ? e.lineNumber : -1;
    ShowHelp(`Error: ${name} @ ${file}#${line}:\n${message}`);
  }
}

export async function main(...args: string[]): Promise<void> {
  try {
    // Get command line
    const cmdLnConfig = parseCommandLine(args);
    if (!isString(cmdLnConfig.root) || cmdLnConfig.root.length === 0) {
      ShowHelp('Missing command line or configuration');
    } else {
      await generate(cmdLnConfig);
    }
  } catch (e) {
    ShowHelp(e as string);
  }
}
