import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { Files } from './types.js';
import { QuoteIfNeeded, Unquote } from './utils.js';

function pathCompare(a: string | null, b: string | null): number {
  if (a === null) return b !== null ? 1 : 0;
  if (b === null) return -1;
  const m = a.toLocaleUpperCase();
  const n = b.toLocaleUpperCase();
  // Don't use localeCompare: it will make some things equal that aren't *quite*
  return (m > n ? 1 : 0) - (m < n ? 1 : 0);
}

// Use this to keep things in a predictable order...
export async function ReadDir(root: string): Promise<string[]> {
  const files: string[] = await fs.readdir(root);
  files.sort(pathCompare);
  return files;
}

// Gets all the files under a given directory
export async function EnumerateFiles(root: string): Promise<string[]> {
  if ((await fs.stat(root)).isDirectory()) {
    const res = [];
    for (const f of await ReadDir(root)) {
      res.push(...(await EnumerateFiles(path.join(Unquote(root), f))));
    }
    return res;
  } else {
    return [root];
  }
}

export async function EnumerateDirectory(root: string): Promise<string[]> {
  if ((await fs.stat(root)).isDirectory()) {
    const r = Unquote(root);
    return (await ReadDir(root)).map((n) => path.join(r, n));
  } else {
    return [];
  }
}

export function GetPath(n: string): string {
  return path.dirname(Unquote(n));
}

function endsWithNoExamples(paths: string[], suffix: string): string[] {
  return paths
    .filter(
      (fn) =>
        fn.endsWith(suffix) &&
        fn.indexOf('/examples/') < 0 &&
        fn.indexOf('\\examples\\') < 0,
    )
    .map((fn) => QuoteIfNeeded(fn).replaceAll('\\', '/'));
}

// Collect all .c, .cpp. .S files, and get the unique paths for VPATH and
// for includes, as applicable
export async function GetFileList(
  filePath: string,
  allFiles?: string[],
): Promise<Files> {
  allFiles = allFiles || (await EnumerateFiles(filePath));
  const c = endsWithNoExamples(allFiles, '.c');
  const cpp = endsWithNoExamples(allFiles, '.cpp');
  const s = endsWithNoExamples(allFiles, '.S');
  const paths = [...new Set([...c, ...cpp, ...s].map(GetPath))];
  const inc = [
    ...new Set(
      endsWithNoExamples(allFiles, '.h').map((fn) =>
        QuoteIfNeeded('-I' + GetPath(fn)),
      ),
    ),
  ];
  const a = endsWithNoExamples(allFiles, '.a');
  return { c, cpp, s, paths, inc, a };
}
