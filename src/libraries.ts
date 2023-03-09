import { Type } from '@freik/core-utils';
import * as path from 'path';
import { enumerateFiles, getFileList, getPath, mkSrcList } from './files.js';
import { makeAppend, makeIfdef, spacey, trimq } from './mkutil.js';
import { parseFile } from './parser.js';
import type {
  Categories,
  Definition,
  Dependency,
  Files,
  LibProps,
  Library,
  ParsedFile,
  SemVer,
} from './types.js';

// Details here:
// https://arduino.github.io/arduino-cli/library-specification/

// Given a set of locations, get all the defs & rules for libraries under them
export async function addLibs(locs: string[]): Promise<Library[]> {
  const libData: Library[] = [];
  for (const loc of locs) {
    // First, find any 'library.properties' files
    const allFiles = await enumerateFiles(loc);
    const libRoots = allFiles.filter(
      (fn) => path.basename(fn) === 'library.properties',
    );
    for (const libRoot of libRoots) {
      const libPath = getPath(libRoot);
      const srcLibFiles = allFiles.filter((f) =>
        f.startsWith(path.join(libPath, 'src')),
      );
      if (srcLibFiles.length === 0) {
        // Make sure that the filter includes the trailing slash,
        // otherwise Time and Timer path allLibFiles
        const withEnd = libPath.endsWith(path.sep)
          ? libPath
          : libPath + path.sep;
        const allLibFiles = allFiles.filter((f) => f.startsWith(withEnd));
        libData.push(await getLibInfo(libPath, allLibFiles));
      } else {
        libData.push(await getLibInfo(libPath, srcLibFiles));
      }
    }
  }
  return libData;
}

// TODO: Be more explicit about handling V1.5+ libs (src dir only, no examples)
async function getLibInfo(root: string, libFiles: string[]): Promise<Library> {
  const { c, cpp, s, paths, inc } = await getFileList(root, libFiles);
  const libName = path.basename(root);
  const libDefName = 'LIB_' + libName.toUpperCase();
  const libCond = makeIfdef(libDefName);
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
  const files: Files = { c: [], cpp: [], s: [], h: [], path: [] };
  const defs: Definition[] = [];
  if (c.length) {
    files.c = c;
    // TODO: Move to Make
    defs.push(mkSrcList('C_SYS_SRCS', c, [], [libCond]));
  }
  if (cpp.length) {
    files.cpp = cpp;
    // TODO: Move to Make
    defs.push(mkSrcList('CPP_SYS_SRCS', cpp, [], [libCond]));
  }
  if (s.length) {
    files.s = s;
    // TODO: Move to Make
    defs.push(mkSrcList('S_SYS_SRCS', s, [], [libCond]));
  }
  files.h = inc;
  // TODO: Move to Make
  defs.push(mkSrcList('SYS_INCLUDES', inc, [], [libCond]));
  files.path = paths;
  // TODO: Move to Make
  defs.push(
    makeAppend('VPATH_MORE', paths.map(spacey).join(' '), [], [libCond]),
  );
  // This is only sort of work for the Adafruit nRFCrypto library
  const lib = await parseFile(path.join(trimq(root), 'library.properties'));
  const props = LibPropsFromParsedFile(lib);
  // TODO: Move to Make
  if (Type.hasStr(props, 'ldflags')) {
    const flgVal = props.ldflags;
    defs.push(makeAppend('COMPILER_LIBRARIES_LDFLAGS', flgVal, [], [libCond]));
    // Probably not right, but this works for nRFCrypto
    libFiles
      .filter((f) => f.endsWith('.a'))
      .forEach((val) =>
        defs.push(
          makeAppend(
            'COMPILER_LIBRARIES_LDFLAGS',
            '-L' + path.dirname(val),
            [],
            [libCond],
          ),
        ),
      );
  }
  return { defs, files, props };
}

function GetSemanticVersion(verstr?: string): SemVer {
  if (Type.isUndefined(verstr)) {
    return '';
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(verstr);
  if (match === null) {
    return verstr;
  }
  const major = Number.parseInt(match[1] || '0', 10);
  const minor = Number.parseInt(match[2] || '0', 10);
  const patch = Number.parseInt(match[3] || '0', 10);
  return { major, minor, patch };
}

function GetDepenencies(deps?: string): Dependency[] {
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

function GetList(str?: string): string[] | undefined {
  if (!Type.isString(str)) return;
  return [...str.split(',').map((v) => v.trim())];
}

function GetPrecomp(pre?: string): boolean | 'full' {
  if (!Type.isString(pre)) {
    return false;
  } else if (pre === 'full') {
    return pre;
  } else {
    return pre === 'true';
  }
}

function GetCategory(str?: string): Categories {
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

function LibPropsFromParsedFile(file: ParsedFile): Partial<LibProps> {
  const tbl = file.scopedTable;
  const name = tbl.get('name')?.value;
  const version = GetSemanticVersion(tbl.get('version')?.value);
  const ldFlags = tbl.get('ldflags');
  const ldflags = ldFlags?.value;
  const architecture = tbl.get('architectures')?.value;
  const depends = GetDepenencies(tbl.get('depends')?.value);
  const staticLink = tbl.get('dot_a_linkage')?.value === 'true';
  const includes = GetList(tbl.get('includes')?.value);
  const precompiled = GetPrecomp(tbl.get('precompiled')?.value);
  const author = GetList(tbl.get('author')?.value);
  const maintainer = tbl.get('maintainer')?.value;
  const sentence = tbl.get('sentence')?.value;
  const paragraph = tbl.get('paragraph')?.value;
  const url = tbl.get('url')?.value;
  const category = GetCategory(tbl.get('category')?.value);
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
