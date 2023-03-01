import { Type } from '@freik/core-utils';
import * as path from 'path';
import { enumerateFiles, getFileList, getPath, mkSrcList } from './files.js';
import { makeAppend, makeIfdef, spacey, trimq } from './mkutil.js';
import { parseFile } from './parser.js';
import type { Definition } from './types.js';

export type Library = { defs: Definition[] };

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
  const defs: Definition[] = [];
  if (c.length) {
    defs.push(mkSrcList('C_SYS_SRCS', c, [], [libCond]));
  }
  if (cpp.length) {
    defs.push(mkSrcList('CPP_SYS_SRCS', cpp, [], [libCond]));
  }
  if (s.length) {
    defs.push(mkSrcList('S_SYS_SRCS', s, [], [libCond]));
  }
  defs.push(mkSrcList('SYS_INCLUDES', inc, [], [libCond]));
  defs.push(
    makeAppend('VPATH_MORE', paths.map(spacey).join(' '), [], [libCond]),
  );
  // This is only sort of work for the Adafruit nRFCrypto library
  const lib = await parseFile(path.join(trimq(root), 'library.properties'));
  const ldFlags = lib.scopedTable.get('ldflags');
  if (!Type.isUndefined(ldFlags) && Type.isString(ldFlags.value)) {
    const flgVal = ldFlags.value;
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
  return { defs };
}
