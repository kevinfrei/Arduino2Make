import { Type } from '@freik/core-utils';
import * as path from 'path';
import { getFileList, mkSrcList } from './files.js';
import { addLibs } from './libraries.js';
import {
  getPlainValue,
  makeAppend,
  makeDeclDef,
  makeDefinitions,
  makeIfeq,
  makeSeqDef,
  makeUnDecl,
  spacey,
  trimq,
} from './mkutil.js';
import type {
  Definition,
  DependentValue,
  FilterFunc,
  Library,
  ParsedFile,
  Recipe,
  SimpleSymbol,
} from './types.js';

function getNestedChild(
  vrbl: SimpleSymbol,
  ...children: string[]
): SimpleSymbol | undefined {
  let v: SimpleSymbol | undefined = vrbl;
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
function makeRecipes(recipes: SimpleSymbol, plat: ParsedFile): Recipe[] {
  function getRule(...location: string[]): DependentValue | undefined {
    const pattern: SimpleSymbol | undefined = getNestedChild(
      recipes,
      ...location,
    );
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
  for (const src of ['S', 'c', 'ino', 'cpp']) {
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

// This generates the rules & whatnot for the platform data
// This is the 'meat' of the whole thing, as recipes generate very different
// Makefile code.
// It also returns the set of probably defined values generated from this code
export async function buildPlatform(
  boardDefs: Definition[],
  platform: ParsedFile,
  rootpath: string,
  libLocs: string[],
): Promise<{ defs: Definition[]; rules: Recipe[] }> {
  const defs: Definition[] = [
    makeDeclDef(
      'BUILD_CORE_PATH',
      '${RUNTIME_PLATFORM_PATH}/cores/${BUILD_CORE}',
      ['RUNTIME_PLATFORM_PATH', 'BUILD_CORE'],
    ),
  ];

  // Now spit out all the variables
  const fakeTop = {
    name: 'fake',
    children: platform.scopedTable,
  };
  const skip: FilterFunc = (a) => a.name !== 'recipe' && a.name !== 'tools';
  const plain = getPlainValue;
  const defined = makeDefinitions(fakeTop, plain, platform, null, skip);

  function parentTool(a: SimpleSymbol): boolean {
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
  const osxCnd = makeIfeq('${RUNTIME_OS}', 'macosx');
  const toolDefs: Definition[] = [];
  for (const osxt of osxTools) {
    const name = osxt.name.substring(0, osxt.name.lastIndexOf('_MACOSX'));
    toolDefs.push(makeDeclDef(name, osxt.value, osxt.dependsOn, [osxCnd]));
  }
  const winCnd = makeIfeq('${RUNTIME_OS}', 'windows');
  for (const wint of winTools) {
    const name = wint.name.substring(0, wint.name.lastIndexOf('_WINDOWS'));
    toolDefs.push(makeDeclDef(name, wint.value, wint.dependsOn, [winCnd]));
  }
  toolDefs.push(
    ...cmds.map((def: Definition) => {
      return makeUnDecl(def.name, def.value, def.dependsOn);
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
      const chup = makeIfeq('${UPLOAD_USE_1200BPS_TOUCH}', 'true');
      const uef = makeDeclDef('UPLOAD_EXTRA_FLAGS', '--touch 1200', [], [chup]);
      toolDefs.push(uef);
      const ucnd = makeIfeq('${UPLOAD_TOOL}', key);
      const patdval = getPlainValue(patt, platform);
      const flashTool = patdval.value.replace(
        '${CMD}',
        '${TOOLS_' + key.toUpperCase() + '_CMD}',
      );
      patdval.unresolved.delete('CMD');
      const tldef = makeDeclDef(
        'UPLOAD_PATTERN',
        flashTool.replace('${BUILD_PATH}', '$(abspath ${BUILD_PATH})'),
        [...patdval.unresolved, uef.name],
        [ucnd],
      );
      toolDefs.push(tldef);
    }
  }
  // Build up all the various make rules from the recipes in the platform file
  const recipeSyms: SimpleSymbol | undefined =
    platform.scopedTable.get('recipe');
  // A rather messy hack to add .ino capabilities: (add -x c++ to the CPP rule)
  if (recipeSyms?.children.has('cpp')) {
    const cppRecipe = recipeSyms.children.get('cpp')!;
    const cppChild: SimpleSymbol | undefined = cppRecipe.children.get('o');
    if (cppChild && cppRecipe.children.size === 1) {
      const cppPattern = cppChild.children.get('pattern');
      if (cppPattern && cppChild.children.size === 1 && !!cppPattern.value) {
        const val = cppPattern.value;
        if (!Type.isString(val)) {
          throw new Error('cpp patterns must be strings, not functions');
        }
        const toAdd = val.indexOf(' "{source_file}" -o ');
        if (toAdd > 0) {
          const value =
            val.substring(0, toAdd) + ' -x c++' + val.substring(toAdd);
          const inoRecipe = {
            name: 'ino',
            parent: cppRecipe.parent,
            children: new Map(),
          };
          const oChildVar: SimpleSymbol = {
            name: 'o',
            children: new Map(),
            parent: inoRecipe,
          };
          const pChildVar: SimpleSymbol = {
            name: 'pattern',
            parent: oChildVar,
            value,
            children: new Map(),
          };
          oChildVar.children.set('pattern', pChildVar);
          inoRecipe.children.set('o', oChildVar);
          recipeSyms.children.set('ino', inoRecipe);
        }
      }
    }
  }
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
    const { c, cpp, s, paths } = await getFileList(
      path.join(trimq(rootpath), 'cores', core),
    );
    const cnd = [makeIfeq('${BUILD_CORE}', core)];
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
      makeAppend(
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
      makeAppend(
        'VPATH_CORE',
        paths.map(spacey).join(' '),
        ['BUILD_CORE'],
        cnd,
      ),
    );
  }
  for (const vrn of variants) {
    const { c, cpp, s, paths, inc } = await getFileList(
      path.join(trimq(rootpath), 'variants', vrn),
    );
    const cnd = [makeIfeq('${BUILD_VARIANT}', vrn)];
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
      makeAppend(
        'VPATH_CORE',
        paths.map(spacey).join(' '),
        ['BUILD_VARIANT'],
        cnd,
      ),
    );
  }

  const libs = await addLibs([rootpath, ...libLocs]);
  libs.forEach((val: Library) => {
    fileDefs.push(...val.defs);
  });

  const sycSrcVal = '${C_SYS_SRCS} ${CPP_SYS_SRCS} ${S_SYS_SRCS}';
  const usrSrcVal = '${USER_C_SRCS} ${USER_CPP_SRCS} ${USER_S_SRCS}';
  fileDefs.push(makeDeclDef('SYS_SRC', sycSrcVal));
  fileDefs.push(makeDeclDef('USER_SRC', usrSrcVal));

  // Add the transformations for source files to obj's
  fileDefs.push(makeDeclDef('ALL_SRC', '${SYS_SRC} ${USER_SRC}'));
  fileDefs.push(
    makeSeqDef('VPATH', '${VPATH}:${VPATH_MORE}:${VPATH_CORE}:${VPATH_VAR}'),
  );
  const mkObjList = (
    name: string,
    varname: string,
    suffix: string,
  ): Definition =>
    makeDeclDef(
      name,
      `\\
  $(addprefix $\{BUILD_PATH}/, \\
    $(patsubst %.c, %.c.${suffix}, \\
      $(patsubst %.cpp, %.cpp.${suffix}, \\
        $(patsubst %.ino, %.ino.${suffix}, \\
          $(patsubst %.S, %.S.${suffix}, $(notdir $\{${varname}\}))))))`,
      [],
      [],
    );
  fileDefs.push(mkObjList('SYS_OBJS', 'SYS_SRC', 'o'));
  fileDefs.push(mkObjList('USER_OBJS', 'USER_SRC', 'o'));
  fileDefs.push(makeDeclDef('ALL_OBJS', '${USER_OBJS} ${SYS_OBJS}'));
  fileDefs.push(mkObjList('SYS_JSON', 'SYS_SRC', 'json'));
  fileDefs.push(mkObjList('USER_JSON', 'USER_SRC', 'json'));
  // ALL_OBJS = \
  // $(addprefix ${M_OUT}/, $(patsubst %.cpp, %.cpp.o, $(notdir ${TUSB_SRCS})))

  return { defs: [...defs, ...defined, ...toolDefs, ...fileDefs], rules };
}
