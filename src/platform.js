// @flow
// @format

const fs = require('fs');
const path = require('path');

const mkutil = require('./mkutil.js');
const mkdef = mkutil.definition;
const mkcnd = mkutil.condition;

import type {
  Variable,
  SymbolTable,
  FlatTable,
  NamedTable,
  ParsedFile,
  FilterFunc,
  DependentValue,
  Definition,
  Condition,
  Recipe
} from './types.js';

const getNestedChild = (vrbl: Variable, children: Array<string>): ?Variable => {
  let v: ?Variable = vrbl;
  for (let child of children) {
    if (!v) {
      return;
    }
    v = v.children.get(child);
  }
  return v;
};

const cleanup = (val: string): string =>
  // there's a -DFOO="${VAR}" in the recipe text
  // This requires that you spit out '-DFOO="${VAR}"'
  val
    .split(' ')
    .map(v => {
      const first = v.indexOf('"');
      const last = v.lastIndexOf('"');
      if (first < 0 && last < 0) {
        return v;
      }
      if (first === 0 && last === v.length - 1) {
        if (v.indexOf('"', 1) === last) {
          return v;
        }
      }
      return `'${v}'`;
    })
    .join(' ');

// For reference, stuff like $@, $^, and $< are called 'automatic variables'
// in the GNU Makefile documentation
const makeRecipes = (recipes: Variable, plat: ParsedFile): Array<Recipe> => {
  const getRule = (location: Array<string>): ?DependentValue => {
    const pattern: ?Variable = getNestedChild(recipes, location);
    if (pattern) {
      let res = mkutil.getPlainValue(pattern, plat);
      if (res.value.length > 0) {
        return res;
      }
    }
  };

  const makeRule = (
    location: Array<string>,
    lhs: string,
    rhs: string
  ): ?DependentValue => {
    const depVal = getRule(location);
    if (!depVal || !depVal.unresolved.has(rhs) || !depVal.unresolved.has(lhs)) {
      return;
    }
    let value = depVal.value
      .replace('${' + rhs + '}', '$<')
      .replace('${' + lhs + '}', '$@');
    depVal.unresolved.delete(lhs);
    depVal.unresolved.delete(rhs);
    return { value, unresolved: depVal.unresolved };
  };
  let result: Array<Recipe> = [];
  // Produces a bunch of things like this:
  // (outdir)%.S.o: %.S
  //  ${tool} -c ${flags} -o $@ $<

  // First, let's just get the .o producers
  for (let src of ['S', 'c', 'cpp']) {
    const depVal: ?DependentValue = makeRule(
      [src, 'o', 'pattern'],
      'OBJECT_FILE',
      'SOURCE_FILE'
    );
    if (!depVal) continue;
    const dependsOn = [...depVal.unresolved];
    let cleanedVal = cleanup(depVal.value);
    result.push({ src, dst: 'o', command: cleanedVal, dependsOn });
  }

  // Create archives (recipe.ar.pattern) sys*.o's => sys.a
  const arcDepVal: ?DependentValue = makeRule(
    ['ar', 'pattern'],
    'ARCHIVE_FILE_PATH',
    'OBJECT_FILE'
  );
  if (arcDepVal) {
    const dependsOn = [...arcDepVal.unresolved];
    result.push({
      src: 'o',
      dst: 'a',
      command: arcDepVal.value.replace('"$<"', '$^'),
      dependsOn
    });
  }
  // linker (recipe.c.combine.patthern) *.o + sys.a => %.elf
  const linkDepVal: ?DependentValue = getRule(['c', 'combine', 'pattern']);
  if (linkDepVal) {
    let { value: command, unresolved: deps } = linkDepVal;
    deps.delete('OBJECT_FILES');
    deps.delete('ARCHIVE_FILE');
    command = command
      .replace('${OBJECT_FILES}', '${USER_OBJS}')
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf', '$@')
      .replace('${ARCHIVE_FILE}', 'system.a');
    result.push({ src: 'o-a', dst: 'elf', command, dependsOn: [...deps] });
  }
  // hex (recipe.objcopy.hex.pattern) .elf => .hex
  const hexDepVal: ?DependentValue = getRule(['objcopy', 'hex', 'pattern']);
  if (hexDepVal) {
    let { value: command, unresolved: deps } = hexDepVal;
    command = command
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf', '$<')
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.hex', '$@');
    result.push({ src: 'elf', dst: 'hex', command, dependsOn: [...deps] });
  }
  // dfu zip packager (recipe.objcopy.zip.pattern) .hex => .zip
  const zipDepVal: ?DependentValue = getRule(['objcopy', 'zip', 'pattern']);
  if (zipDepVal) {
    let { value: command, unresolved: deps } = zipDepVal;
    command = command
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.hex', '$<')
      .replace('${BUILD_PATH}/${BUILD_PROJECT_NAME}.zip', '$@');
    result.push({ src: 'hex', dst: 'zip', command, dependsOn: [...deps] });
  }
  // Future: Add more recipe support in here?
  // size, and whatever the 'output.tmp_file/save_file stuff is used for...
  return result;
};

const enumerateFiles = (root: string): Array<string> =>
  fs.statSync(root).isDirectory()
    ? [].concat.apply(
        [],
        fs.readdirSync(root).map(f => enumerateFiles(path.join(root, f)))
      )
    : [root];

const getPath = (fn: string) => fn.substr(0, fn.lastIndexOf('/'));
const getFileList = (path: string) => {
  const allFiles: Array<string> = enumerateFiles(path);
  const c = allFiles.filter(fn => fn.endsWith('.c'));
  const cpp = allFiles.filter(fn => fn.endsWith('.cpp'));
  const s = allFiles.filter(fn => fn.endsWith('.S'));
  const paths = [...new Set(allFiles.map(getPath))];
  const inc = [
    ...new Set(allFiles.filter(fn => fn.endsWith('.h')).map(getPath))
  ];
  return { c, cpp, s, paths, inc };
};
// This generates the rules & whatnot for the platform data
// This is the 'meat' of the whole thing, as recipes generate very different
// Makefile code.
// It also returns the set of probably defined values generated from this code
const dumpPlatform = (
  boardDefs: Array<Definition>,
  platform: ParsedFile,
  rootpath: string
): { defs: Array<Definition>, rules: Array<Recipe> } => {
  let defs: Array<Definition> = [
    mkdef(
      'BUILD_CORE_PATH',
      '${RUNTIME_PLATFORM_PATH}/cores/${BUILD_CORE}',
      ['RUNTIME_PLATFORM_PATH', 'BUILD_CORE'],
      []
    )
  ];

  // Now spit out all the variables
  const fakeTop = {
    name: 'fake',
    children: platform.scopedTable,
    parent: null
  };
  const skip = a => a.name !== 'recipe' && a.name !== 'tools';
  const plain = mkutil.getPlainValue;
  const defined = mkutil.makeDefinitions(fakeTop, plain, platform, null, skip);

  const onlyTools = a => a.name === 'tools';
  const parentTool = (a: Variable): boolean => {
    for (; a.parent; a = a.parent) {
      if (a.name === 'tools') {
        return true;
      }
    }
    return a.name === 'tools';
  };
  const toolDefs = mkutil.makeDefinitions(
    fakeTop,
    plain,
    platform,
    null,
    parentTool
  );
  // TODO: Handle the macosx/windows suffixed tools
  // TODO: Also handle the {cmd} thing which clearly refers to
  // the locally scoped cmd (or cmd.windows/cmd.macosx thing)
  // as well as the tools.(name).OPERATION.pattern
  // and tools.(name).OPERATION.params.VARNAME

  // Build up all the various make rules from the recipes in the platform file
  const recipeSyms = platform.scopedTable.get('recipe');
  const rules: Array<Recipe> = recipeSyms
    ? makeRecipes(recipeSyms, platform)
    : [];

  // TODO: Get the file list together (just more definitions, I think)
  // For each build.core, create a file list
  const cores: Set<string> = new Set(
    boardDefs.filter(def => def.name === 'BUILD_CORE').map(def => def.value)
  );

  const variants: Set<string> = new Set(
    boardDefs.filter(def => def.name === 'BUILD_VARIANT').map(def => def.value)
  );

  let fileDefs: Array<Definition> = [];
  // Get the full file list & include path for each core & variant
  const mkSysList = (
    name: string,
    files: Array<string>,
    depend: string,
    cnd: Array<Condition>
  ): Definition => mkdef(name, files.join(' \\\n    '), [depend], cnd);

  for (let core of cores) {
    const { c, cpp, s, paths } = getFileList(rootpath + '/cores/' + core);
    const cnd = [mkcnd('ifeq', '${BUILD_CORE}', core)];
    fileDefs.push(mkSysList('C_SYS_CORE_SRCS', c, 'BUILD_CORE', cnd));
    fileDefs.push(mkSysList('CPP_SYS_CORE_SRCS', cpp, 'BUILD_CORE', cnd));
    fileDefs.push(mkSysList('S_SYS_CORE_SRCS', s, 'BUILD_CORE', cnd));
    //    fileDefs.push(mkSysList('SYS_CORE_INCLUDES', inc, 'BUILD_CORE', cnd));

    // I need to decide: VPATH or multiple rules!
    // VPATH is easier, so for now let's do that
    fileDefs.push(mkdef('VPATH_CORE', paths.join(':'), ['BUILD_CORE'], cnd));
  }
  for (let vrn of variants) {
    const { c, cpp, s, paths, inc } = getFileList(
      rootpath + '/variants/' + vrn
    );
    const cnd = [mkcnd('ifeq', '${BUILD_VARIANT}', vrn)];
    fileDefs.push(mkSysList('C_SYS_VAR_SRCS', c, 'BUILD_VARIANT', cnd));
    fileDefs.push(mkSysList('CPP_SYS_VAR_SRCS', cpp, 'BUILD_VARIANT', cnd));
    fileDefs.push(mkSysList('S_SYS_VAR_SRCS', s, 'BUILD_VARIANT', cnd));
    fileDefs.push(mkSysList('SYS_VAR_INCLUDES', inc, 'BUILD_VARIANT', cnd));
    // I need to decide: VPATH or multiple rules!
    // VPATH is easier, so for now let's do that
    fileDefs.push(mkdef('VPATH_VAR', paths.join(':'), ['BUILD_VARIANT'], cnd));
  }

  const sycSrcVal =
    '${C_SYS_VAR_SRCS} ${CPP_SYS_VAR_SRCS} ${S_SYS_VAR_SRCS} ' +
    '${C_SYS_CORE_SRCS} ${CPP_SYS_CORE_SRCS} ${S_SYS_CORE_SRCS}';
  const usrSrcVal = '${USER_C_SRCS} ${USER_CPP_SRCS} ${USER_S_SRCS}';
  fileDefs.push(mkdef('SYS_SRC', sycSrcVal, [], []));
  fileDefs.push(mkdef('USER_SRC', usrSrcVal, [], []));

  // Add the transformations for source files to obj's
  fileDefs.push(mkdef('ALL_SRC', '${SYS_SRC} ${USER_SRC}', [], []));
  fileDefs.push(mkdef('VPATH', '${VPATH}:${VPATH_CORE}:${VPATH_VAR}', [], []));
  const mkObjList = (name: string, varname: string): Definition =>
    mkdef(
      name,
      `\\
  $(addprefix $\{BUILD_PATH}/, \\
    $(patsubst %.c, %.c.o, \\
      $(patsubst %.cpp, %.cpp.o, \\
        $(patsubst %.S, %.S.o, $(notdir $\{${varname}\})))))`,
      [],
      []
    );
  fileDefs.push(mkObjList('SYS_OBJS', 'SYS_SRC'));
  fileDefs.push(mkObjList('USER_OBJS', 'USER_SRC'));
  fileDefs.push(mkdef('ALL_OBJS', '${USER_OBJS} ${SYS_OBJS}', [], []));
  //ALL_OBJS = \
  // $(addprefix ${M_OUT}/, $(patsubst %.cpp, %.cpp.o, $(notdir ${TUSB_SRCS})))

  return { defs: [...defs, ...defined, ...toolDefs, ...fileDefs], rules };
};

module.exports = dumpPlatform;
