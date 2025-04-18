import { isString, isUndefined } from '@freik/typechk';
import { promises as fsp } from 'fs';
import * as path from 'path';

import {
  EnumerateDirectory,
  EnumerateFiles,
  GetFileList,
  ReadDir,
} from './files.js';
import { ParseFile } from './parser.js';
import type {
  Categories,
  DumbSymTbl,
  LibDependency,
  LibProps,
  Library,
  ParsedFile,
  SemVer,
} from './types.js';
import { Unquote } from './utils.js';

// Details here:
// https://arduino.github.io/arduino-cli/library-specification/

function getSemanticVersion(verstr?: string): SemVer {
  if (isUndefined(verstr)) {
    return '';
  }
  const match = /^(\d+)(?:\.(\d+)(?:\.(\d+))?)?$/.exec(verstr);
  if (match === null) {
    return verstr;
  }
  const major = Number.parseInt(match[1] || '0', 10);
  const minor = Number.parseInt(match[2] || '0', 10);
  const patch = Number.parseInt(match[3] || '0', 10);
  return { major, minor, patch };
}

// TODO: Handle version stuff
function getDependencies(deps?: string): LibDependency[] {
  if (!isString(deps)) return [];
  return [
    ...deps
      .split(',')
      .map((val) => val.trim())
      .map((trimmed): LibDependency => {
        const open = trimmed.lastIndexOf('(');
        if (open > 0 && trimmed.endsWith(')')) {
          const name = trimmed.substring(0, open).trim();
          const ver = trimmed.substring(open + 1, trimmed.length - 1);
          return { name, ver };
        } else {
          return { name: trimmed };
        }
      }),
  ];
}

function getList(str?: string): string[] | undefined {
  if (!isString(str)) return;
  return [...str.split(',').map((v) => v.trim())];
}

function getPrecomp(pre?: string): boolean | 'full' {
  if (!isString(pre)) {
    return false;
  } else if (pre === 'full') {
    return pre;
  } else {
    return pre === 'true';
  }
}

function getCategory(str?: string): Categories {
  switch (str) {
    case 'Uncategorized':
    case 'Display':
    case 'Communication':
    case 'Signal Input/Output':
    case 'Sensors':
    case 'Device Control':
    case 'Timing':
    case 'Data Storage':
    case 'Data Processing':
      return str;
    default:
      return 'Other';
  }
}

function getString(name: string, tbl: DumbSymTbl): string | undefined {
  const val = tbl.get(name)?.value;
  if (isString(val)) {
    return val;
  }
}

function libPropsFromParsedFile(file: ParsedFile): LibProps {
  const tbl = file.scopedTable;
  const name = getString('name', tbl) || ''; // Yeah, this better be there...
  const version = getSemanticVersion(getString('version', tbl));
  const ldflags = getString('ldflags', tbl);
  const architecture = getString('architectures', tbl);
  const depends = getDependencies(getString('depends', tbl));
  const staticLink = getString('dot_a_linkage', tbl) === 'true';
  const includes = getList(getString('includes', tbl));
  const precompiled = getPrecomp(getString('precompiled', tbl));
  const author = getList(getString('author', tbl));
  const maintainer = getString('maintainer', tbl);
  const sentence = getString('sentence', tbl);
  const paragraph = getString('paragraph', tbl);
  const url = getString('url', tbl);
  const category = getCategory(getString('category', tbl));
  return {
    name,
    version,
    author,
    maintainer,
    sentence,
    paragraph,
    category,
    url,
    architecture,
    depends,
    staticLink,
    includes,
    precompiled,
    ldflags,
  };
}

async function isLibrary(loc: string): Promise<boolean> {
  // If the folder contains a 'library.properties' file, it's a library
  // If it contains a 'keywords.txt' file, it's a library
  // If it contains any .h, .cpp, .c files, it's a library
  if (!(await fsp.stat(loc)).isDirectory()) {
    return false;
  }
  for (const file of (await ReadDir(loc)).map((v) => v.toLocaleLowerCase())) {
    if (file === 'library.properties') {
      return true;
    }
    /* 
    // A src folder requires a library.properties file, so don't handle this:
    if (file === 'src'){
      // TODO: Check if it's a dir...
      return true;
    }
    */
    if (file === 'keywords.txt') {
      return true;
    }
    if (file.endsWith('.h') || file.endsWith('.c') || file.endsWith('.cpp')) {
      return true;
    }
  }
  return false;
}

// We may have individual library locations, or a folder that contains a number
// of *singly nested* library locations.
// This turns them into the former (a list of library locations)
async function getLibraryLocations(locs: string[]): Promise<string[]> {
  const libLocs: string[] = [];
  for (const lib of locs) {
    if (await isLibrary(lib)) {
      libLocs.push(lib);
    } else {
      for (const sub of await EnumerateDirectory(lib)) {
        if ((await fsp.stat(sub)).isDirectory() && (await isLibrary(sub))) {
          libLocs.push(sub);
        }
      }
    }
  }
  return libLocs;
}

async function makeV15Library(
  rootpath: string,
  flatFiles: string[],
): Promise<Library> {
  let libFiles: string[] = [];
  const uqr = Unquote(rootpath);
  if (flatFiles.some((v) => v.toLocaleLowerCase() === 'src')) {
    // Recurse into the src directory for v1.5 libraries
    libFiles = await EnumerateFiles(path.join(uqr, 'src'));
  } else {
    // No src directory, not recursion
    libFiles = flatFiles.map((f) => path.join(uqr, f));
  }
  const lib = await ParseFile(path.join(uqr, 'library.properties'));
  const props = libPropsFromParsedFile(lib);
  const files = await GetFileList(rootpath, libFiles);
  return { rootpath, files, props };
}

async function makeV10Library(
  rootpath: string,
  flatFiles: string[],
): Promise<Library> {
  const uqr = Unquote(rootpath);
  const files = await GetFileList(
    rootpath,
    flatFiles.map((f) => path.join(uqr, f)),
  );
  return { rootpath, files, props: { name: path.basename(rootpath) } };
}

// From the given root, create a library
async function makeLibrary(root: string): Promise<Library> {
  const flatFiles = await ReadDir(root);
  const isV15 = flatFiles.some(
    (v) => v.toLocaleLowerCase() === 'library.properties',
  );
  return await (isV15 ? makeV15Library : makeV10Library)(root, flatFiles);
}

export async function GetLibraries(
  rootpath: string,
  libLocs: string[],
): Promise<Library[]> {
  // Get the library list from the platform
  const realLibLocs = await getLibraryLocations([
    path.join(rootpath, 'libraries'),
    ...libLocs,
  ]);
  const libs = await Promise.all(realLibLocs.map(makeLibrary));
  return libs;
}
