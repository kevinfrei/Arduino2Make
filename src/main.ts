import { Type } from '@freik/core-utils';
import { promises as fs } from 'fs';
import minimist from 'minimist';
import path from 'path';
import { EnumerateBoards } from './board.js';
import { IsConfigPresent, ReadConfig } from './config.js';
import { MakeGlobals } from './globals.js';
import { GetLibraries } from './libraries.js';
import { ParseFile } from './parser.js';
import { GetGnuMakeTarget } from './targets/gnumake.js';
import { Definition, PlatformTarget, Recipe } from './types.js';

let outputFile: string[] | undefined;
let outputName: string | undefined;

function setOutputFile(dest: unknown) {
  if (Type.isString(dest)) {
    outputName = dest;
    outputFile = [];
  }
}

function dumpToFile(message: unknown): void {
  if (outputFile !== undefined && Type.isString(message)) {
    outputFile.push(message);
  }
}

// Eventually, we can dump stuff into different files, right?
export function Dump(which?: string): (message: unknown) => void {
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

const platformTarget: PlatformTarget = GetGnuMakeTarget();

export function GetTarget(): PlatformTarget {
  return platformTarget;
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
  setOutputFile(argv?.out);
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
    const boardSyms = await ParseFile(boardPath);
    const platformPath = path.join(root, 'platform.txt');
    const platSyms = await ParseFile(platformPath);

    // Scan the libraries:
    // TODO: Move Defs from Library into platformtTarget
    const libraries = await GetLibraries(root, libLocs);

    const globals = MakeGlobals(platformTarget);
    const boards = EnumerateBoards(boardSyms);

    // Emit the build stuff:
    await platformTarget.emit(platformPath, platSyms, boardSyms, libraries);

    // Flush the output to disk...
    if (!Type.isUndefined(outputFile) && Type.isString(outputName)) {
      await fs.writeFile(outputName, outputFile.join('\n'), 'utf-8');
    }
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

export function CalculateChecksAndOrderDefinitions(
  defs: Definition[],
  rules: Recipe[],
  optionalDefs: string[],
): { checks: string[]; defs: Definition[] } {
  // Don't know if I'll need the rules or not

  // First, let's identify all the mandatory user-defined symbols
  const allDefs = new Set(defs.map((d) => d.name));
  const tmp: string[] = [];
  const allDeps = new Set(
    tmp.concat(
      ...defs.map((d) => d.dependsOn),
      ...rules.map((rec) => rec.dependsOn),
    ),
  );
  // Remove allDefs from allDeps
  const checks: Set<string> = new Set(
    [...allDeps].filter((x) => !allDefs.has(x)),
  );
  const done: Set<string> = new Set(checks);
  // Clear out known optional values
  optionalDefs.forEach((a) => checks.delete(a));

  // Now checks has the list of all undefined symbols
  // These should have checks emitted in the makefile to validate that the user
  // has defined them already (or have defaults assigned if that's unimportant)

  function allDefined(def: Definition): boolean {
    for (const d of def.dependsOn) {
      if (!done.has(d)) {
        return false;
      }
    }
    return true;
  }
  const ordered: Definition[] = [];
  const stillPending: Map<string, number> = new Map();
  defs.forEach((d: Definition) => {
    let val = stillPending.get(d.name);
    if (typeof val !== 'number') {
      val = 0;
    }
    stillPending.set(d.name, val + 1);
  });
  // This is such a lame, slow sorting algorithm. I really should do better...
  const skip: Set<number> = new Set();
  for (let i = 0; i < defs.length; i++) {
    if (!skip.has(i)) {
      if (allDefined(defs[i])) {
        ordered.push(defs[i]);
        done.add(defs[i].name);
        skip.add(i);
        i = -1;
      }
    }
  }

  return { checks: [...checks.keys()], defs: ordered };
}
