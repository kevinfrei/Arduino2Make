// @flow
// @format

const mkutil = require('./mkutil.js');

import type {
  Variable,
  SymbolTable,
  FlatTable,
  NamedTable,
  ParsedFile,
  ResolvedValue,
  FilterFunc,
  Definition,
  Condition
} from './types.js';

// This generates the rules & whatnot for the platform data
// This is the 'meat' of the whole thing, as recipes generate very different
// Makefile code.
// It also returns the set of probably defined values generated from this code
const dumpPlatform = (
  platform: ParsedFile
): Array<Definition> => {
  let defs:Array<Definition> = [
    mkutil.definition(
      'BUILD_CORE_PATH',
      '${RUNTIME_PLATFORM_PATH}/cores/${BUILD_CORE}',
      ['RUNTIME_PLATFORM_PATH', 'BUILD_CORE']
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
  const defined = mkutil.dumpVars('', fakeTop, platform, plain, skip);
  // TODO: Do something with the recipes & tools
  return defs;
};

module.exports = dumpPlatform;
