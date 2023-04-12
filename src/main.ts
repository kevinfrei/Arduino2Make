import { Type } from '@freik/core-utils';
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
  if (!Type.isUndefined(message)) {
    const msg = Type.isString(message) ? [message] : message;
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

async function parseCommandLine(args: string[]): Promise<string[]> {
  const argv = minimist(args, {
    // eslint-disable-next-line id-blacklist
    string: ['config', 'target', 'out', 'help'],
    // eslint-disable-next-line @typescript-eslint/naming-convention
    alias: { c: 'config', t: 'target', o: 'out', h: 'help', '?': 'help' },
    default: { target: 'gnumake' },
  });
  if (Type.hasStr(argv, 'help')) {
    ShowHelp();
  }
  if (Type.hasStr(argv, 'config')) {
    await ReadConfig(argv.config);
  }
  SetOutputFile(argv?.out);
  if (Type.hasStr(argv, 'target')) {
    if (argv.target.toLocaleLowerCase() !== 'gnumake') {
      throw Error(`Command line error: Unsupported target ${argv.target}`);
    }
  }
  return argv._;
}

export default async function main(...args: string[]): Promise<void> {
  try {
    // Get command line
    const normalArgs = await parseCommandLine(args);
    if (normalArgs.length === 0 && !IsConfigPresent()) {
      ShowHelp('Missing command line or configuration');
    }
    const root = normalArgs[0];
    const libLocs = normalArgs.slice(1);
    // Parse the input files
    const boardPath = path.join(root, 'boards.txt');
    const boards = EnumerateBoards(await ParseFile(boardPath));
    const platformPath = path.join(root, 'platform.txt');
    const platform = MakePlatform(await ParseFile(platformPath));
    // Scan the libraries:
    // TODO: Move Defs from Library into platformtTarget
    const libraries = await GetLibraries(root, libLocs);

    // const globals = MakeGlobals(buildSysTarget);

    // Emit the build stuff:
    await buildSysTarget.emit(platformPath, platform, boards, libraries);

    // Flush the output to disk...
    await FlushOutput();
  } catch (e) {
    const name = Type.hasStr(e, 'name') ? e.name : '<unknown>';
    const message = Type.hasStr(e, 'message') ? e.message : '<no message>';
    const file = Type.hasStr(e, 'fileName') ? e.fileName : '<no filename>';
    const line =
      Type.has(e, 'lineNumber') && Type.isNumber(e.lineNumber)
        ? e.lineNumber
        : -1;
    ShowHelp(`Error: ${name} @ ${file}#${line}:\n${message}`);
  }
}
