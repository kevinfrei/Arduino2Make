import { Type } from '@freik/core-utils';
import { promises as fs } from 'fs';
import path from 'path';
import { EnumerateBoards } from './board.js';
import { IsConfigPresent, ReadConfig } from './config.js';
import { MakeGlobals } from './globals.js';
import { ParseFile } from './parser.js';
import { BuildPlatform } from './platform.js';
import { GenBoardDefs } from './targets/makeBoard.js';
import { Emit } from './targets/makefile.js';
import { Definition, Recipe } from './types.js';

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

export default async function main(...args: string[]): Promise<void> {
  const noConfig = args.filter((val) => !val.startsWith('--config:'));
  await ReadConfig(args.filter((val) => val.startsWith('--config:')));
  const normalArgs = openOutputFile(noConfig);

  if (normalArgs.length === 0 && !IsConfigPresent()) {
    Dump('err')(
      'Usage: {--config:file.json} {--out:<filename>} rootDir {lib1Dir lib2Dir lib3Dir}',
    );
    Dump('err')(
      "  rootDir is where you can find 'boards.txt' and 'platform.txt'",
    );
    return;
  }
  const root = normalArgs[0];
  const libLocs = normalArgs.slice(1);
  const board = path.join(root, 'boards.txt');
  const platform = path.join(root, 'platform.txt');
  const globals = MakeGlobals();
  const boardSyms = await ParseFile(board);
  const platSyms = await ParseFile(platform);
  const boards = EnumerateBoards(boardSyms);
  const boardDefined = GenBoardDefs(boardSyms);

  // TODO: Don't have recipes & tools fully handled in the platform yet
  const { defs: platDefs, rules } = await BuildPlatform(
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
