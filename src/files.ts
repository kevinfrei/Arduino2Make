import { pathCompare } from '@freik/node-utils';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { Filter } from './config.js';
import { makeAppend, spacey, trimq } from './mkutil.js';
import { Condition, Definition } from './types.js';

// Use this to keep things in a predictable order...
export async function ReadDir(root: string): Promise<string[]> {
  const files: string[] = await fsp.readdir(root);
  files.sort(pathCompare);
  return files;
}

// Gets all the files under a given directory
export async function enumerateFiles(root: string): Promise<string[]> {
  if ((await fsp.stat(root)).isDirectory()) {
    const res = [];
    for (const f of await ReadDir(root)) {
      res.push(...(await enumerateFiles(path.join(trimq(root), f))));
    }
    return res;
  } else {
    return [root];
  }
}

export async function EnumerateDirectory(root: string): Promise<string[]> {
  if ((await fsp.stat(root)).isDirectory()) {
    const r = trimq(root);
    return (await ReadDir(root)).map((n) => path.join(r, n));
  } else {
    return [];
  }
}

export const getPath = (n: string) => path.dirname(trimq(n));

function endsWithNoExamples(paths: string[], suffix: string): string[] {
  return paths
    .filter(
      (fn) =>
        fn.endsWith(suffix) &&
        fn.indexOf('/examples/') < 0 &&
        fn.indexOf('\\examples\\') < 0,
    )
    .map((fn) => spacey(fn).replaceAll('\\', '/'));
}

// Collect all .c, .cpp. .S files, and get the unique paths for VPATH and
// for includes, as applicable
export async function getFileList(filePath: string, allFiles?: string[]) {
  allFiles = allFiles || (await enumerateFiles(filePath));
  const c = endsWithNoExamples(allFiles, '.c');
  const cpp = endsWithNoExamples(allFiles, '.cpp');
  const s = endsWithNoExamples(allFiles, '.S');
  const paths = [...new Set([...c, ...cpp, ...s].map(getPath))];
  const inc = [
    ...new Set(
      endsWithNoExamples(allFiles, '.h').map((fn) =>
        spacey('-I' + getPath(fn)),
      ),
    ),
  ];
  return { c, cpp, s, paths, inc };
}

export function mkSrcList(
  name: string,
  files: string[],
  depend: string | string[],
  cnd: Condition[],
): Definition {
  const filteredFiles = Filter(name, files);
  return makeAppend(
    name,
    filteredFiles.join(' \\\n    '),
    typeof depend === 'string' ? [depend] : depend,
    cnd,
  );
}
