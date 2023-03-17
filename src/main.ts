import {
  hasFieldType,
  hasStrField,
  isNumber,
  isString,
  isUndefined,
} from '@freik/typechk';
import minimist from 'minimist';
import path from 'node:path';

import { EnumerateBoards } from './board';
import { AddConfig, LoadConfig } from './config';
import { Dump, FlushOutput, SetOutputFile } from './dump';
import { GetLibraries } from './libraries';
import { ParseFile, ParseSymbolTable } from './parser';
import { MakePlatform } from './platform';
import { GetTarget, SetTarget } from './target';
import { GetGnuMakeTarget } from './targets/gnumake';
import { RunConfig } from './types';

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
}

function parseCommandLine(args: string[]): RunConfig {
  const argv = minimist(args, {
    string: ['config', 'target', 'out', 'help'],
    alias: { c: 'config', t: 'target', o: 'out', h: 'help', '?': 'help' },
    default: { target: 'gnumake' },
  });
  if (hasStrField(argv, 'help')) {
    ShowHelp();
    process.exit(0);
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
  if (target === undefined) {
    ShowHelp(`Unsupported target ${argv.target}`);
    process.exit(1);
  }
  if (outputFile === undefined) {
    ShowHelp('Missing output file');
    process.exit(1);
  }
  return { configFile, outputFile, target, root, libs };
}

async function applyConfig(config: RunConfig): Promise<void> {
  if (config.configFile) {
    await LoadConfig(config.configFile);
  }
  if (config.changes) {
    AddConfig(config.changes);
  }
  if (config.outputFile) {
    SetOutputFile(config.outputFile);
  }
  if (config.target && config.target !== 'gnumake') {
    throw Error(`Unsupported target ${config.target}`);
  }
  SetTarget(GetGnuMakeTarget());
}

export async function generate(config: RunConfig): Promise<void> {
  try {
    await applyConfig(config);
    const { root, libs } = config;
    // Parse the input files
    const boardPath = path.join(root, 'boards.txt');
    const boardSymTab = await ParseSymbolTable(boardPath);
    const boards = EnumerateBoards(await ParseFile(boardPath));
    const platformPath = path.join(root, 'platform.txt');
    const platSymTab = await ParseSymbolTable(platformPath);
    const platform = MakePlatform(await ParseFile(platformPath));
    // Scan the libraries:
    // TODO: Move Defs from Library into platformTarget
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
