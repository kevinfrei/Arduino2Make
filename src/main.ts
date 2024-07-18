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
import { IsConfigPresent, ReadConfig } from './config.js';
import { Dump, FlushOutput, SetOutputFile } from './dump.js';
import { GetLibraries } from './libraries.js';
import { ParseFile } from './parser.js';
import { MakePlatform } from './platform.js';
import { GetGnuMakeTarget } from './targets/gnumake.js';
import { BuildSystemHost } from './types.js';

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

export function ShowHelp(message?: string | string[]) {
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

const buildSysTarget: BuildSystemHost = GetGnuMakeTarget();

export function GetTarget(): BuildSystemHost {
  return buildSysTarget;
}

export type RunConfig = {
  configFile?: string;
  outputFile?: string;
  target?: 'gnumake';
  root: string;
  libs?: string[];
};

function parseCommandLine(args: string[]): RunConfig {
  const argv = minimist(args, {
    // eslint-disable-next-line id-blacklist
    string: ['config', 'target', 'out', 'help'],
    // eslint-disable-next-line @typescript-eslint/naming-convention
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
    await ReadConfig(config.configFile);
  }
  if (config.outputFile) {
    SetOutputFile(config.outputFile);
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
    await buildSysTarget.emit(platformPath, platform, boards, libraries);

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
    if (
      (!isString(cmdLnConfig.root) || cmdLnConfig.root.length === 0) &&
      !IsConfigPresent()
    ) {
      ShowHelp('Missing command line or configuration');
    } else {
      await generate(cmdLnConfig);
    }
  } catch (e) {
    ShowHelp(e as string);
  }
}
