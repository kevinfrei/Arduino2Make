import { Type } from '@freik/core-utils';
import * as path from 'path';
import { MakeSrcList } from '../files.js';
import { MakeAppend, MakeIfdef, makifyName, QuoteIfNeeded } from '../mkutil.js';
import type { Definition, Files, LibProps } from '../types.js';

// Details here:
// https://arduino.github.io/arduino-cli/library-specification/

// TODO: Move to Make
export function GetLibDefs(
  { c, cpp, s, inc, paths, a }: Files,
  props: LibProps,
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
  // Definitely not right, but this works for nRFCrypto
  // I need something about the target architecture to to it right...
  const libpaths = new Set(a.map((lib) => path.dirname(lib)));
  if (libpaths.size > 0) {
    [...libpaths].forEach((val) =>
      defs.push(
        MakeAppend('COMPILER_LIBRARIES_LDFLAGS', '-L' + val, [], [libCond]),
      ),
    );
  }
  if (Type.hasStr(props, 'ldflags')) {
    const flgVal = props.ldflags;
    defs.push(MakeAppend('COMPILER_LIBRARIES_LDFLAGS', flgVal, [], [libCond]));
  }
  return defs;
}
