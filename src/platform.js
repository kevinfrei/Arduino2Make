// @flow
// @format

const mkutil = require('./mkutil.js');

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
    result.push({ src, dst: 'o', command: depVal.value, dependsOn });
  }

  // Create archives (recipe.ar.pattern) sys*.o's => sys.a
  const arcDepVal: ?DependentValue = makeRule(
    ['ar', 'pattern'],
    'ARCHIVE_FILE_PATH',
    'OBJECT_FILE'
  );
  if (arcDepVal) {
    const dependsOn = [...arcDepVal.unresolved];
    result.push({ src: 'o', dst: 'a', command: arcDepVal.value, dependsOn });
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

// This generates the rules & whatnot for the platform data
// This is the 'meat' of the whole thing, as recipes generate very different
// Makefile code.
// It also returns the set of probably defined values generated from this code
const dumpPlatform = (
  boardDefs: Array<Definition>,
  platform: ParsedFile
): { defs: Array<Definition>, rules: Array<Recipe> } => {
  let defs: Array<Definition> = [
    mkutil.definition(
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
  return { defs: [...defs, ...defined, ...toolDefs], rules };
};

module.exports = dumpPlatform;
