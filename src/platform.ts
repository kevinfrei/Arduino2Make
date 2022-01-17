import * as fs from 'fs';
import * as path from 'path';
import { Filter } from './main.js';
import {
  getPlainValue,
  makeAppend as mkapp,
  makeDeclDef as mkdef,
  makeDefinitions,
  makeIfdef as mkdf,
  makeIfeq as mkeq,
  makeSeqDef as mkseq,
  makeUnDecl as mkundef,
  spacey,
  trimq,
} from './mkutil.js';
import type {
  Condition,
  Definition,
  DependentValue,
  FilterFunc,
  ParsedFile,
  Recipe,
  Variable,
} from './types.js';

function getNestedChild(
  vrbl: Variable,
  ...children: string[]
): Variable | undefined {
  let v: Variable | undefined = vrbl;
  for (const child of children) {
    if (!v) {
      return;
    }
    v = v.children.get(child);
  }
  return v;
}

function cleanup(val: string): string {
  // there's a -DFOO="${VAR}" in the recipe text
  // This requires that you spit out '-DFOO="${VAR}"'

  // This is also where I fix the fact that there's nowhere to include
  // the *root* directory of the cores/<name> location...

  // FYI: This code isn't actually completely correct: it will break if you
  // sneeze at it (or have a quote string with a space :/ )
  return val
    .split(' ')
    .map((v) => {
      if (v === '${INCLUDES}') {
        return '${SYS_INCLUDES} ${USER_INCLUDES}';
      }
      const firstDQ = v.indexOf('"');
      const lastDQ = v.lastIndexOf('"');
      if (firstDQ < 0 && lastDQ < 0) {
        return v;
      }
      if (firstDQ === 0 && lastDQ === v.length - 1) {
        if (v.indexOf('"', 1) === lastDQ) {
          return v;
        }
      }
      const firstSQ = v.indexOf("'");
      const lastSQ = v.lastIndexOf("'");
      return firstSQ === 0 &&
        lastSQ === v.length - 1 &&
        v.indexOf("'", 1) === lastSQ
        ? v
        : `'${v}'`;
    })
    .join(' ');
}

// For reference, stuff like $@, $^, and $< are called 'automatic variables'
// in the GNU Makefile documentation
function makeRecipes(recipes: Variable, plat: ParsedFile): Recipe[] {
  function getRule(...location: string[]): DependentValue | undefined {
    const pattern: Variable | undefined = getNestedChild(recipes, ...location);
    if (pattern) {
      const res = getPlainValue(pattern, plat);
      if (res.value.length > 0) {
        return res;
      }
    }
  }

  function makeRule(
    location: string[],
    lhs: string,
    rhs: string,
  ): DependentValue | undefined {
    const depVal = getRule(...location);
    if (!depVal || !depVal.unresolved.has(rhs) || !depVal.unresolved.has(lhs)) {
      return;
    }
    const value = depVal.value
      .replace('${' + rhs + '}', '$<')
      .replace('${' + lhs + '}', '$@');
    depVal.unresolved.delete(lhs);
    depVal.unresolved.delete(rhs);
    return { value, unresolved: depVal.unresolved };
  }
  const result: Recipe[] = [];
  // Produces a bunch of things like this:
  // (outdir)%.S.o: %.S
  //  ${tool} -c ${flags} -o $@ $<

  // First, let's just get the .o producers
  for (const src of ['S', 'c', 'cpp']) {
    const depVal: DependentValue | undefined = makeRule(
      [src, 'o', 'pattern'],
      'OBJECT_FILE',
      'SOURCE_FILE',
    );
    if (!depVal) continue;
    const dependsOn = [...depVal.unresolved];
    const cleanedVal = cleanup(depVal.value);
    result.push({ src, dst: 'o', command: cleanedVal, dependsOn });
  }

  // Create archives (recipe.ar.pattern) sys*.o's => sys.a
  const arcDepVal: DependentValue | undefined = makeRule(
    ['ar', 'pattern'],
    'ARCHIVE_FILE_PATH',
    'OBJECT_FILE',
  );
  if (arcDepVal) {
    const dependsOn = [...arcDepVal.unresolved];
    result.push({
      src: 'o',
      dst: 'a',
      command: arcDepVal.value.replace('"$<"', '$^'),
      dependsOn,
    });
  }
  // linker (recipe.c.combine.patthern) *.o + sys.a => %.elf
  const linkDepVal: DependentValue | undefined = getRule(
    'c',
    'combine',
    'pattern',
  );
  if (linkDepVal) {
    const { value, unresolved: deps } = linkDepVal;
    deps.delete('OBJECT_FILES');
    deps.delete('ARCHIVE_FILE');
    const command = value
      .replace('${OBJECT_FILES}', '${USER_OBJS}')
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf', '$@')
      .replace('${ARCHIVE_FILE}', 'system.a');
    result.push({ src: 'o-a', dst: 'elf', command, dependsOn: [...deps] });
  }
  // hex (recipe.objcopy.hex.pattern) .elf => .hex
  const hexDepVal: DependentValue | undefined = getRule(
    'objcopy',
    'hex',
    'pattern',
  );
  if (hexDepVal) {
    const { value, unresolved: deps } = hexDepVal;
    const command = value
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf', '$<')
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.hex', '$@');
    result.push({ src: 'elf', dst: 'hex', command, dependsOn: [...deps] });
  }
  // dfu zip packager (recipe.objcopy.zip.pattern) .hex => .zip
  const zipDepVal: DependentValue | undefined = getRule(
    'objcopy',
    'zip',
    'pattern',
  );
  if (zipDepVal) {
    const { value, unresolved: deps } = zipDepVal;
    const command = value
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.hex', '$<')
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.zip', '$@');
    result.push({ src: 'hex', dst: 'zip', command, dependsOn: [...deps] });
    // Finally, add a 'flash' target
    result.push({
      src: 'zip',
      dst: 'flash',
      command: '${UPLOAD_PATTERN} ${UPLOAD_EXTRA_FLAGS}',
      dependsOn: [],
    });
  } else if (hexDepVal) {
    // If we don't have a zip target, I guess create a hex target?
    result.push({
      src: 'hex',
      dst: 'flash',
      command: '${UPLOAD_PATTERN} ${UPLOAD_EXTRA_FLAGS}',
      dependsOn: [],
    });
  } else {
    // TODO: What do we do without a zip or a hex target?
  }
  // Future: Add more recipe support in here?
  // size, and whatever the 'output.tmp_file/save_file stuff is used for...
  return result;
}

// Gets all the files under a given directory
function enumerateFiles(root: string): string[] {
  if (fs.statSync(root).isDirectory()) {
    const dirs: string[] = fs.readdirSync(root);
    return ([] as string[]).concat(
      ...dirs.map((f) => enumerateFiles(path.join(trimq(root), f))),
    );
  } else {
    return [root];
  }
}

const getPath = (n: string) => path.dirname(trimq(n));
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
function getFileList(filePath: string, allFiles?: string[]) {
  allFiles = allFiles || enumerateFiles(filePath);
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

function mkSrcList(
  name: string,
  files: string[],
  depend: string | string[],
  cnd: Condition[],
): Definition {
  const filteredFiles = Filter(name, files);
  return mkapp(
    name,
    filteredFiles.join(' \\\n    '),
    typeof depend === 'string' ? [depend] : depend,
    cnd,
  );
}

function getLibInfo(
  root: string,
  libFiles: string[],
): {
  defs: Definition[];
  rules: Recipe[];
} {
  const { c, cpp, s, paths, inc } = getFileList(root, libFiles);
  const libName = path.basename(root);
  const libDefName = 'LIB_' + libName.toUpperCase();
  const libCond = mkdf(libDefName);
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
  defs.push(mkapp('VPATH_MORE', paths.map(spacey).join(' '), [], [libCond]));
  // This is only sort of work for the Adafruit nRFCrypto library
  const fileContents = fs
    .readFileSync(path.join(trimq(root), 'library.properties'))
    .toString();
  const ldFlagsPos = fileContents.indexOf('\nldflags');
  if (ldFlagsPos >= 0) {
    const endOfLd = fileContents.indexOf('\n', ldFlagsPos + 1);
    const flgVal =
      endOfLd > 0
        ? fileContents.substring(ldFlagsPos + 9, endOfLd)
        : fileContents.substring(ldFlagsPos + 9);
    defs.push(mkapp('COMPILER_LIBRARIES_LDFLAGS', flgVal, [], [libCond]));
    // Probably not right, but this works for nRFCrypto
    libFiles
      .filter((f) => f.endsWith('.a'))
      .forEach((val) =>
        defs.push(
          mkapp(
            'COMPILER_LIBRARIES_LDFLAGS',
            '-L' + path.dirname(val),
            [],
            [libCond],
          ),
        ),
      );
  }
  return { defs, rules: [] };
}

// Given a set of locations, get all the defs & rules for libraries under them
function addLibs(locs: string[]): {
  defs: Definition[];
  rules: Recipe[];
} {
  const defs: Definition[] = [];
  const rules: Recipe[] = [];
  for (const loc of locs) {
    // First, find any 'library.properties' files
    const allFiles = enumerateFiles(loc);
    const libRoots = allFiles.filter(
      (fn) => path.basename(fn) === 'library.properties',
    );
    for (const libRoot of libRoots) {
      const libPath = getPath(libRoot);
      const libFiles = allFiles.filter((f) => f.startsWith(libPath));
      const libData = getLibInfo(libPath, libFiles);
      defs.push(...libData.defs);
      rules.push(...libData.rules);
    }
  }
  return { defs, rules };
}

// This generates the rules & whatnot for the platform data
// This is the 'meat' of the whole thing, as recipes generate very different
// Makefile code.
// It also returns the set of probably defined values generated from this code
export function buildPlatform(
  boardDefs: Definition[],
  platform: ParsedFile,
  rootpath: string,
  libLocs: string[],
): { defs: Definition[]; rules: Recipe[] } {
  const defs: Definition[] = [
    mkdef(
      'BUILD_CORE_PATH',
      '${RUNTIME_PLATFORM_PATH}/cores/${BUILD_CORE}',
      ['RUNTIME_PLATFORM_PATH', 'BUILD_CORE'],
      [],
    ),
  ];

  // Now spit out all the variables
  const fakeTop = {
    name: 'fake',
    children: platform.scopedTable,
    parent: null,
  };
  const skip: FilterFunc = (a) => a.name !== 'recipe' && a.name !== 'tools';
  const plain = getPlainValue;
  const defined = makeDefinitions(fakeTop, plain, platform, null, skip);

  function parentTool(a: Variable): boolean {
    for (; a.parent; a = a.parent) {
      if (a.name === 'tools') {
        return true;
      }
    }
    return a.name === 'tools';
  }
  const tmpToolDefs = makeDefinitions(
    fakeTop,
    plain,
    platform,
    null,
    parentTool,
  );
  // Handle the macosx/windows suffixed tools
  // FYI: My input tester stuff has precisely 1 of these tools, so
  // what I'm doing down here may not work properly with something with more
  const cmds = tmpToolDefs.filter((fn) => fn.name.endsWith('_CMD'));
  const osxTools = tmpToolDefs.filter((fn) => fn.name.endsWith('_MACOSX'));
  const winTools = tmpToolDefs.filter((fn) => fn.name.endsWith('_WINDOWS'));
  const osxCnd = mkeq('${RUNTIME_OS}', 'macosx');
  const toolDefs: Definition[] = [];
  for (const osxt of osxTools) {
    const name = osxt.name.substring(0, osxt.name.lastIndexOf('_MACOSX'));
    toolDefs.push(mkdef(name, osxt.value, osxt.dependsOn, [osxCnd]));
  }
  const winCnd = mkeq('${RUNTIME_OS}', 'windows');
  for (const wint of winTools) {
    const name = wint.name.substring(0, wint.name.lastIndexOf('_WINDOWS'));
    toolDefs.push(mkdef(name, wint.value, wint.dependsOn, [winCnd]));
  }
  toolDefs.push(
    ...cmds.map((def: Definition) => {
      return mkundef(def.name, def.value, def.dependsOn, []);
    }),
  );

  // This stuff should turn into rules, not definitions, I think
  // It looks like the board selects the tool & protocol
  // The tool ought to be the name of the thing
  // The protocol seems to imply that Arduino groks a variety of flash tools :/

  // TODO: Also handle the {cmd} thing which clearly refers to
  // the locally scoped cmd (or cmd.windows/cmd.macosx thing)
  // as well as the tools.(name).OPERATION.pattern
  // and tools.(name).OPERATION.params.VARNAME
  /*
  const weirdToolDefs = tmpToolDefs.filter(
    (fn) =>
      !fn.name.endsWith('_CMD') &&
      !fn.name.endsWith('_MACOSX') &&
      !fn.name.endsWith('_WINDOWS'),
  );
  */
  const toolsSyms = platform.scopedTable.get('tools');
  if (toolsSyms) {
    for (const [key, value] of toolsSyms.children) {
      const patt = getNestedChild(value, 'upload', 'pattern');
      // const params = getNestedChild(value, 'upload', 'params');
      if (!patt) continue;
      // TODO: Add support for UPLOAD_WAIT_FOR_UPLOAD_PORT
      // TODO: Add support for UPLOAD_USE_1200BPS_TOUCH
      const chup = mkeq('${UPLOAD_USE_1200BPS_TOUCH}', 'true');
      const uef = mkdef('UPLOAD_EXTRA_FLAGS', '--touch 1200', [], [chup]);
      toolDefs.push(uef);
      const ucnd = mkeq('${UPLOAD_TOOL}', key);
      const patdval = getPlainValue(patt, platform);
      const flashTool = patdval.value.replace(
        '${CMD}',
        '${TOOLS_' + key.toUpperCase() + '_CMD}',
      );
      patdval.unresolved.delete('CMD');
      const tldef = mkdef(
        'UPLOAD_PATTERN',
        flashTool.replace('${BUILD_PATH}', '$(abspath ${BUILD_PATH})'),
        [...patdval.unresolved, uef.name],
        [ucnd],
      );
      toolDefs.push(tldef);
    }
  }
  // Build up all the various make rules from the recipes in the platform file
  const recipeSyms = platform.scopedTable.get('recipe');
  const rules: Recipe[] = recipeSyms ? makeRecipes(recipeSyms, platform) : [];

  // TODO: Get the file list together (just more definitions, I think)
  // For each build.core, create a file list
  const cores: Set<string> = new Set(
    boardDefs
      .filter((def) => def.name === 'BUILD_CORE')
      .map((def) => def.value),
  );

  const variants: Set<string> = new Set(
    boardDefs
      .filter((def) => def.name === 'BUILD_VARIANT')
      .map((def) => def.value),
  );

  const fileDefs: Definition[] = [];
  // Get the full file list & include path for each core & variant
  for (const core of cores) {
    const { c, cpp, s, paths } = getFileList(
      path.join(trimq(rootpath), 'cores', core),
    );
    const cnd = [mkeq('${BUILD_CORE}', core)];
    if (c.length) {
      fileDefs.push(mkSrcList('C_SYS_SRCS', c, 'BUILD_CORE', cnd));
    }
    if (cpp.length) {
      fileDefs.push(mkSrcList('CPP_SYS_SRCS', cpp, 'BUILD_CORE', cnd));
    }
    if (s.length) {
      fileDefs.push(mkSrcList('S_SYS_SRCS', s, 'BUILD_CORE', cnd));
    }
    fileDefs.push(
      mkapp(
        'SYS_INCLUDES',
        ' ' +
          spacey(
            `-I${path
              .join(trimq(rootpath), 'cores', core)
              .replaceAll('\\', '/')}`,
          ),
        ['BUILD_CORE'],
        cnd,
      ),
    );
    // fileDefs.push(mkSrcList('SYS_CORE_INCLUDES', inc, 'BUILD_CORE', cnd));

    // I need to decide: VPATH or multiple rules!
    // VPATH is easier, so for now let's do that
    fileDefs.push(
      mkapp('VPATH_CORE', paths.map(spacey).join(' '), ['BUILD_CORE'], cnd),
    );
  }
  for (const vrn of variants) {
    const { c, cpp, s, paths, inc } = getFileList(
      path.join(trimq(rootpath), 'variants', vrn),
    );
    const cnd = [mkeq('${BUILD_VARIANT}', vrn)];
    if (c.length) {
      fileDefs.push(mkSrcList('C_SYS_SRCS', c, 'BUILD_VARIANT', cnd));
    }
    if (cpp.length) {
      fileDefs.push(mkSrcList('CPP_SYS_SRCS', cpp, 'BUILD_VARIANT', cnd));
    }
    if (s.length) {
      fileDefs.push(mkSrcList('S_SYS_SRCS', s, 'BUILD_VARIANT', cnd));
    }
    fileDefs.push(mkSrcList('SYS_INCLUDES', inc, 'BUILD_VARIANT', cnd));
    // I need to decide: VPATH or multiple rules!
    // VPATH is easier, so for now let's do that
    fileDefs.push(
      mkapp('VPATH_CORE', paths.map(spacey).join(' '), ['BUILD_VARIANT'], cnd),
    );
  }

  const { defs: libsDefs, rules: libRules } = addLibs([rootpath, ...libLocs]);
  fileDefs.push(...libsDefs);
  rules.push(...libRules);
  const sycSrcVal = '${C_SYS_SRCS} ${CPP_SYS_SRCS} ${S_SYS_SRCS}';
  const usrSrcVal = '${USER_C_SRCS} ${USER_CPP_SRCS} ${USER_S_SRCS}';
  fileDefs.push(mkdef('SYS_SRC', sycSrcVal, [], []));
  fileDefs.push(mkdef('USER_SRC', usrSrcVal, [], []));

  // Add the transformations for source files to obj's
  fileDefs.push(mkdef('ALL_SRC', '${SYS_SRC} ${USER_SRC}', [], []));
  fileDefs.push(
    mkseq('VPATH', '${VPATH}:${VPATH_MORE}:${VPATH_CORE}:${VPATH_VAR}', [], []),
  );
  const mkObjList = (
    name: string,
    varname: string,
    suffix: string,
  ): Definition =>
    mkdef(
      name,
      `\\
  $(addprefix $\{BUILD_PATH}/, \\
    $(patsubst %.c, %.c.${suffix}, \\
      $(patsubst %.cpp, %.cpp.${suffix}, \\
        $(patsubst %.S, %.S.${suffix}, $(notdir $\{${varname}\})))))`,
      [],
      [],
    );
  fileDefs.push(mkObjList('SYS_OBJS', 'SYS_SRC', 'o'));
  fileDefs.push(mkObjList('USER_OBJS', 'USER_SRC', 'o'));
  fileDefs.push(mkdef('ALL_OBJS', '${USER_OBJS} ${SYS_OBJS}', [], []));
  fileDefs.push(mkObjList('SYS_JSON', 'SYS_SRC', 'json'));
  fileDefs.push(mkObjList('USER_JSON', 'USER_SRC', 'json'));
  // ALL_OBJS = \
  // $(addprefix ${M_OUT}/, $(patsubst %.cpp, %.cpp.o, $(notdir ${TUSB_SRCS})))

  return { defs: [...defs, ...defined, ...toolDefs, ...fileDefs], rules };
}
