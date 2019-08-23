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
  Definition,
  Condition,
  Recipe
} from './types.js';

const makeRecipes = (recipes: Variable, plat: ParsedFile): Array<Recipe> => {
  let result: Array<Recipe> = [];
  // Produces a bunch of things like this:
  // (outdir)%.S.o: %.S
  //  ${tool} -c ${flags} -o $@ $<

  // I expect .S.o, .c.o, and .cpp.o compilation patterns
  // There are also .c.combine which is really .o's to .elf
  // simple .ar to which is "shove a .o into an .ar"
  // Then there's objcopy.hex, which is actually .elf to .hex
  // Also objcopy.zip which is .hex to .zip
  // In addition, there's size which is to figure out the size of the package
  // and a couple others

  // First, let's just get the .o producers
  for (let src of ['S', 'c', 'cpp']) {
    const sym: ?Variable = recipes.children.get(src);
    if (!sym) continue;
    const o: ?Variable = sym.children.get('o');
    if (!o) continue;
    const pattern: ?Variable = o.children.get('pattern');
    if (!pattern) continue;
    // We've got the pattern. Get the value, and replace the special things
    // as appropriate
    const { value, unresolved } = mkutil.getPlainValue(pattern, plat);
    if (value.length === 0) continue;
    if (unresolved.has('SOURCE_FILE') && unresolved.has('OBJECT_FILE')) {
      const command = value
        .replace('${SOURCE_FILE}', '$<')
        .replace('${OBJECT_FILE}', '$@');
      unresolved.delete('SOURCE_FILE');
      unresolved.delete('OBJECT_FILE');
      result.push({
        src,
        dst: 'o',
        command,
        dependsOn: [...unresolved.keys()]
      });
    }
  }
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
  // TODO: Continue here, this isn't complete yet
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

  // Build up all the various make rules from the recipes in the platform file
  const recipeSyms = platform.scopedTable.get('recipe');
  const rules: Array<Recipe> = recipeSyms
    ? makeRecipes(recipeSyms, platform)
    : [];

  return { defs: [...defs, ...defined, ...toolDefs], rules };
};

module.exports = dumpPlatform;
