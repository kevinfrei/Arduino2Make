import { Type } from '@freik/core-utils';
import * as path from 'path';
import { GetFileList } from '../files.js';
import { GetNestedChild } from '../symbols.js';
import type {
  AllRecipes,
  Definition,
  DependentValue,
  Library,
  ParsedFile,
  Platform,
  SimpleSymbol,
} from '../types.js';
import {
  GetPlainValue,
  MakeDependentValue,
  MakeResolve,
  QuoteIfNeeded,
  ResolveString,
  Unquote,
} from '../utils.js';
import { GetLibDefs } from './gmLibs.js';
import { MakePrefixer } from './gmPrefixer.js';
import {
  MakeAppend,
  MakeDeclDef,
  MakeDefinitions,
  MakeIfeq,
  MakeSeqDef,
  MakeSrcList,
  MakeUnDecl,
} from './gmUtils.js';
import { GnuMakeRecipe } from './gnumake.js';

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
function makeRecipes(recipes: SimpleSymbol, rec: AllRecipes): GnuMakeRecipe[] {
  function getRule(...location: string[]): DependentValue | undefined {
    const pattern: SimpleSymbol | undefined = GetNestedChild(
      recipes,
      ...location,
    );
    if (pattern) {
      const res = GetPlainValue(pattern);
      if (res.value.length > 0) {
        return res;
      }
    }
  }

  function makefileRule(
    pattern: string,
    lhs: string,
    rhs: string,
    rhsRep: string,
  ): DependentValue {
    const depVal = MakeDependentValue(pattern);
    if (!depVal || !depVal.unresolved.has(rhs) || !depVal.unresolved.has(lhs)) {
      throw new Error('Missing required recipe pattern');
    }
    return MakeResolve(MakeResolve(depVal, rhs, rhsRep), lhs, '$@');
  }

  function makeORecipe(pattern: string, src: string): GnuMakeRecipe {
    const rule = makefileRule(pattern, 'OBJECT_FILE', 'SOURCE_FILE', '$<');
    return {
      src,
      dst: 'o',
      command: cleanup(rule.value),
      dependsOn: [...rule.unresolved],
    };
  }

  const result: GnuMakeRecipe[] = [];
  // Produces a bunch of things like this:
  // (outdir)%.S.o: %.S
  //  ${tool} -c ${flags} -o $@ $<

  // First, get the .o producers
  result.push(makeORecipe(rec.s.pattern, 'S'));
  result.push(makeORecipe(rec.c.pattern, 'c'));
  // kludge for .ino files:
  result.push(
    makeORecipe(
      rec.cpp.pattern.replace(
        ' "{source_file}" -o ',
        ' -x c++ "{source_file}" -o ',
      ),
      'ino',
    ),
  );
  result.push(makeORecipe(rec.cpp.pattern, 'cpp'));

  // Create archives (recipe.ar.pattern) sys*.o's => sys.a
  const arRule = makefileRule(
    rec.ar.pattern,
    'ARCHIVE_FILE_PATH',
    'OBJECT_FILE',
    '$#@!', // Placeholder to rip out extra double-quotes
  );
  result.push({
    src: 'o',
    dst: 'a',
    command: arRule.value.replace('"$#@!"', '$^'),
    dependsOn: [...arRule.unresolved],
  });

  // linker (recipe.c.combine.patthern) *.o + sys.a => %.elf
  const linkDepVal = ResolveString(
    MakeResolve(
      MakeResolve(
        MakeDependentValue(rec.link.pattern),
        'OBJECT_FILES',
        '${USER_OBJS}',
      ),
      'ARCHIVE_FILE',
      'system.a',
    ),
    '${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf',
    '$@',
  );
  result.push({
    src: 'o-a',
    dst: 'elf',
    command: linkDepVal.value,
    dependsOn: [...linkDepVal.unresolved],
  });

  // hex (recipe.objcopy.hex.pattern) .elf => .hex
  // TODO: This is wrong, but the docs for this stuff are truly awful
  // Come back to it if I decide I want to make this stuff work for
  // more platforms...
  const hex = rec.objcopy.find((val) => val.name === 'hex');
  let hexDepVal: DependentValue | undefined;
  if (!Type.isUndefined(hex)) {
    hexDepVal = ResolveString(
      ResolveString(
        MakeDependentValue(hex.pattern.pattern),
        '${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf',
        '$<',
      ),
      '${BUILD_PATH}/${BUILD_PROJECT_NAME}.hex',
      '$@',
    );
    result.push({
      src: 'elf',
      dst: 'hex',
      command: hexDepVal.value,
      dependsOn: [...hexDepVal.unresolved],
    });
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

function makeToolDefs(platform: Platform) {
  function parentTool(a: SimpleSymbol): boolean {
    for (; a.parent; a = a.parent) {
      if (a.name === 'tools') {
        return true;
      }
    }
    return a.name === 'tools';
  }
  const tmpToolDefs = platform.tools
    ? MakeDefinitions(
        { name: 'fake2', children: new Map([['fake2', platform.tools]]) },
        GetPlainValue,
        null,
        parentTool,
      )
    : [];
  // Handle the macosx/windows suffixed tools
  // FYI: My input tester stuff has precisely 1 of these tools, so
  // what I'm doing down here may not work properly with something with more
  const cmds = tmpToolDefs.filter((fn) => fn.name.endsWith('_CMD'));
  const osxTools = tmpToolDefs.filter((fn) => fn.name.endsWith('_MACOSX'));
  const winTools = tmpToolDefs.filter((fn) => fn.name.endsWith('_WINDOWS'));
  const osxCnd = MakeIfeq('${RUNTIME_OS}', 'macosx');
  const toolDefs: Definition[] = [];
  for (const osxt of osxTools) {
    const name = osxt.name.substring(0, osxt.name.lastIndexOf('_MACOSX'));
    toolDefs.push(MakeDeclDef(name, osxt.value, osxt.dependsOn, [osxCnd]));
  }
  const winCnd = MakeIfeq('${RUNTIME_OS}', 'windows');
  for (const wint of winTools) {
    const name = wint.name.substring(0, wint.name.lastIndexOf('_WINDOWS'));
    toolDefs.push(MakeDeclDef(name, wint.value, wint.dependsOn, [winCnd]));
  }
  toolDefs.push(
    ...cmds.map((def: Definition) => {
      return MakeUnDecl(def.name, def.value, def.dependsOn);
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
  if (platform.tools) {
    for (const [key, value] of platform.tools.children) {
      const patt = GetNestedChild(value, 'upload', 'pattern');
      // const params = GetNestedChild(value, 'upload', 'params');
      if (!patt) continue;
      // TODO: Add support for UPLOAD_WAIT_FOR_UPLOAD_PORT
      // TODO: Add support for UPLOAD_USE_1200BPS_TOUCH
      const chup = MakeIfeq('${UPLOAD_USE_1200BPS_TOUCH}', 'true');
      const uef = MakeDeclDef('UPLOAD_EXTRA_FLAGS', '--touch 1200', [], [chup]);
      toolDefs.push(uef);
      const ucnd = MakeIfeq('${UPLOAD_TOOL}', key);
      const patdval = GetPlainValue(patt);
      const flashTool = patdval.value.replace(
        '${CMD}',
        '${TOOLS_' + key.toUpperCase() + '_CMD}',
      );
      patdval.unresolved.delete('CMD');
      const tldef = MakeDeclDef(
        'UPLOAD_PATTERN',
        flashTool.replace('${BUILD_PATH}', '$(abspath ${BUILD_PATH})'),
        [...patdval.unresolved, uef.name],
        [ucnd],
      );
      toolDefs.push(tldef);
    }
  }
  return toolDefs;
}

// This generates the rules & whatnot for the platform data
// This is the 'meat' of the whole thing, as recipes generate very different
// Makefile code.
// It also returns the set of probably defined values generated from this code
export async function BuildPlatform(
  initialDefs: Definition[],
  boardDefs: Definition[],
  plSyms: ParsedFile,
  platform: Platform,
  rootpath: string,
  libs: Library[],
): Promise<{ defs: Definition[]; rules: GnuMakeRecipe[] }> {
  const defs: Definition[] = [
    MakeDeclDef(
      'BUILD_CORE_PATH',
      '${RUNTIME_PLATFORM_PATH}/cores/${BUILD_CORE}',
      ['RUNTIME_PLATFORM_PATH', 'BUILD_CORE'],
    ),
  ];

  // const skip: FilterFunc = (a) => a.name !== 'recipe' && a.name !== 'tools';
  const defined = MakeDefinitions(
    { name: 'fake', children: platform.misc },
    GetPlainValue,
    null,
  );

  const toolDefs: Definition[] = makeToolDefs(platform);

  // Build up all the various make rules from the recipes in the platform file
  const recipeSyms = plSyms.scopedTable.get('recipe');

  const rules: GnuMakeRecipe[] = recipeSyms
    ? makeRecipes(recipeSyms, platform.recipes)
    : [];

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
  // Make a 'Prefixer' to replace paths with variables when possible
  const pfx = MakePrefixer([
    [
      initialDefs.find((val) => val.name === 'RUNTIME_PLATFORM_PATH')?.value ||
        '!@#$',
      '${RUNTIME_PLATFORM_PATH}',
    ],
  ]);
  // Get the full file list & include path for each core & variant
  for (const core of cores) {
    const { c, cpp, s, paths } = await GetFileList(
      path.join(Unquote(rootpath), 'cores', core),
    );
    const cnd = [MakeIfeq('${BUILD_CORE}', core)];
    if (c.length) {
      fileDefs.push(MakeSrcList('C_SYS_SRCS', c, 'BUILD_CORE', cnd, pfx));
    }
    if (cpp.length) {
      fileDefs.push(MakeSrcList('CPP_SYS_SRCS', cpp, 'BUILD_CORE', cnd, pfx));
    }
    if (s.length) {
      fileDefs.push(MakeSrcList('S_SYS_SRCS', s, 'BUILD_CORE', cnd, pfx));
    }
    fileDefs.push(
      MakeAppend(
        'SYS_INCLUDES',
        ' ' +
          QuoteIfNeeded(
            `-I${pfx(
              path.join(Unquote(rootpath), 'cores', core).replaceAll('\\', '/'),
            )}`,
          ),
        ['BUILD_CORE'],
        cnd,
      ),
    );
    // fileDefs.push(mkSrcList('SYS_CORE_INCLUDES', inc, 'BUILD_CORE', cnd));

    // I need to decide: VPATH or multiple rules!
    // VPATH is easier, so for now let's do that
    const moreVpath = paths.map(QuoteIfNeeded).map(pfx).join(' ');
    if (moreVpath.length > 0) {
      fileDefs.push(MakeAppend('VPATH_CORE', moreVpath, ['BUILD_CORE'], cnd));
    }
  }
  for (const vrn of variants) {
    const { c, cpp, s, paths, inc } = await GetFileList(
      path.join(Unquote(rootpath), 'variants', vrn),
    );
    const cnd = [MakeIfeq('${BUILD_VARIANT}', vrn)];
    if (c.length) {
      fileDefs.push(MakeSrcList('C_SYS_SRCS', c, 'BUILD_VARIANT', cnd, pfx));
    }
    if (cpp.length) {
      fileDefs.push(
        MakeSrcList('CPP_SYS_SRCS', cpp, 'BUILD_VARIANT', cnd, pfx),
      );
    }
    if (s.length) {
      fileDefs.push(MakeSrcList('S_SYS_SRCS', s, 'BUILD_VARIANT', cnd, pfx));
    }
    fileDefs.push(
      MakeSrcList('SYS_INCLUDES', inc, 'BUILD_VARIANT', cnd, pfx, '-I'),
    );
    // I need to decide: VPATH or multiple rules!
    // VPATH is easier, so for now let's do that
    const moreVpath = paths.map(QuoteIfNeeded).map(pfx).join(' ');
    if (moreVpath.length > 0) {
      fileDefs.push(
        MakeAppend('VPATH_CORE', moreVpath, ['BUILD_VARIANT'], cnd),
      );
    }
  }
  libs.forEach((val: Library) => {
    fileDefs.push(...GetLibDefs(val, pfx));
  });

  const sycSrcVal = '${C_SYS_SRCS} ${CPP_SYS_SRCS} ${S_SYS_SRCS}';
  const usrSrcVal = '${USER_C_SRCS} ${USER_CPP_SRCS} ${USER_S_SRCS}';
  fileDefs.push(MakeDeclDef('SYS_SRC', sycSrcVal));
  fileDefs.push(MakeDeclDef('USER_SRC', usrSrcVal));

  // Add the transformations for source files to obj's
  fileDefs.push(MakeDeclDef('ALL_SRC', '${SYS_SRC} ${USER_SRC}'));
  fileDefs.push(
    MakeSeqDef('VPATH', '${VPATH}:${VPATH_MORE}:${VPATH_CORE}:${VPATH_VAR}'),
  );
  const mkObjList = (
    name: string,
    varname: string,
    suffix: string,
  ): Definition =>
    MakeDeclDef(
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
  fileDefs.push(MakeDeclDef('ALL_OBJS', '${USER_OBJS} ${SYS_OBJS}'));
  fileDefs.push(mkObjList('SYS_JSN', 'SYS_SRC', 'jsn'));
  fileDefs.push(mkObjList('USER_JSN', 'USER_SRC', 'jsn'));
  // ALL_OBJS = \
  // $(addprefix ${M_OUT}/, $(patsubst %.cpp, %.cpp.o, $(notdir ${TUSB_SRCS})))

  return { defs: [...defs, ...defined, ...toolDefs, ...fileDefs], rules };
}
