import { Type } from '@freik/core-utils';
import { promises as fsp } from 'fs';
import * as path from 'path';
import {
  EnumerateDirectory,
  EnumerateFiles,
  GetFileList,
  MakeSrcList,
  ReadDir,
} from './files.js';
import {
  MakeAppend,
  MakeIfdef,
  makifyName,
  QuoteIfNeeded,
  Unquote,
} from './mkutil.js';
import { ParseFile } from './parser.js';
import type {
  Categories,
  Definition,
  Dependency,
  Files,
  LibProps,
  Library,
  ParsedFile,
  SemVer,
  SymbolTable,
} from './types.js';

// Details here:
// https://arduino.github.io/arduino-cli/library-specification/

function getFiles({ c, cpp, s, inc, paths }: Files): Files {
  const files: Files = { c: [], cpp: [], s: [], inc: [], paths: [] };
  if (c.length) {
    files.c = c;
    // TODO: Move to Make
  }
  if (cpp.length) {
    files.cpp = cpp;
    // TODO: Move to Make
  }
  if (s.length) {
    files.s = s;
    // TODO: Move to Make
  }
  files.inc = inc;
  // TODO: Move to Make
  files.paths = paths;
  // TODO: Move to Make
  return files;
}

// TODO: Move to Make
function getDefs(
  { c, cpp, s, inc, paths }: Files,
  props: LibProps,
  libFiles: string[],
): Definition[] {
  const libDefName = 'LIB_' + makifyName(props.name);
  const libCond = MakeIfdef(libDefName);
  // I need to define a source list, include list
  // In addition, I need to define a variable that the user can include on
  // a lib list to be linked against
  /*
    ifdef LIB_WIRE => ifneq (${LIBWIRE},)
    CPP_SYS_CORE_SRC := ${CPP_SYS_CORE_SRC} Wire.cpp
    SYS_VAR_INCLUDES := ${SYS_VAR_INCLUDES} -I../libLocation/.../Wire/
    VPATH:=${VPATH}:../libLocation/.../Wire/
    endif
  */
  const defs: Definition[] = [];
  if (c.length) {
    defs.push(MakeSrcList('C_SYS_SRCS', c, [], [libCond]));
  }
  if (cpp.length) {
    defs.push(MakeSrcList('CPP_SYS_SRCS', cpp, [], [libCond]));
  }
  if (s.length) {
    defs.push(MakeSrcList('S_SYS_SRCS', s, [], [libCond]));
  }
  defs.push(MakeSrcList('SYS_INCLUDES', inc, [], [libCond]));
  if (paths.length > 0) {
    defs.push(
      MakeAppend(
        'VPATH_MORE',
        paths.map(QuoteIfNeeded).join(' '),
        [],
        [libCond],
      ),
    );
  }
  if (Type.hasStr(props, 'ldflags')) {
    const flgVal = props.ldflags;
    defs.push(MakeAppend('COMPILER_LIBRARIES_LDFLAGS', flgVal, [], [libCond]));
    // TODO: Do this right
    // Probably not right, but this works for nRFCrypto
    libFiles
      .filter((f) => f.endsWith('.a'))
      .forEach((val) =>
        defs.push(
          MakeAppend(
            'COMPILER_LIBRARIES_LDFLAGS',
            '-L' + path.dirname(val),
            [],
            [libCond],
          ),
        ),
      );
  }
  return defs;
}

function getSemanticVersion(verstr?: string): SemVer {
  if (Type.isUndefined(verstr)) {
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
function getDependencies(deps?: string): Dependency[] {
  if (!Type.isString(deps)) return [];
  return [
    ...deps
      .split(',')
      .map((val) => val.trim())
      .map((trimmed): Dependency => {
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
  if (!Type.isString(str)) return;
  return [...str.split(',').map((v) => v.trim())];
}

function getPrecomp(pre?: string): boolean | 'full' {
  if (!Type.isString(pre)) {
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

function getString(name: string, tbl: SymbolTable): string | undefined {
  const val = tbl.get(name)?.value;
  if (Type.isString(val)) {
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
  root: string,
  flatFiles: string[],
): Promise<Library> {
  let libFiles: string[] = [];
  const uqr = Unquote(root);
  if (flatFiles.some((v) => v.toLocaleLowerCase() === 'src')) {
    // Recurse into the src directory for v1.5 libraries
    libFiles = await EnumerateFiles(path.join(uqr, 'src'));
  } else {
    // No src directory, not recursion
    libFiles = flatFiles.map((f) => path.join(uqr, f));
  }
  const lib = await ParseFile(path.join(uqr, 'library.properties'));
  const props = libPropsFromParsedFile(lib);
  const allFiles = await GetFileList(root, libFiles);
  const files = getFiles(allFiles);
  const defs = getDefs(allFiles, props, libFiles);
  return { defs, files, props };
}

async function makeV10Library(
  root: string,
  flatFiles: string[],
): Promise<Library> {
  const uqr = Unquote(root);
  const fileTypes = await GetFileList(
    root,
    flatFiles.map((f) => path.join(uqr, f)),
  );
  const libName = path.basename(root);
  const files = getFiles(fileTypes);
  const props: LibProps = { name: libName };
  const defs = getDefs(fileTypes, props, flatFiles);
  return { defs, files, props: { name: libName } };
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
  const platformLibs = await EnumerateDirectory(
    path.join(rootpath, 'libraries'),
  );
  const userLibs = await getLibraryLocations(libLocs);
  const libs = await Promise.all(
    [...platformLibs, ...userLibs].map(makeLibrary),
  );
  return libs;
}
