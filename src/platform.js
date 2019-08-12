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
  FilterFunc
} from './types.js';

// This generates the rules & whatnot for the platform data
// This is the 'meat' of the whole thing, as recipes generate very different
// Makefile code.
// It also returns the set of probably defined values generated from this code
const dumpPlatform = (
  board: Set<string>,
  platform: ParsedFile
): Set<string> => {
  console.log('# TODO: generate Platform stuff!');
  /*  console.log(board);
  console.log(platform);*/
  return new Set();
};

module.exports = dumpPlatform;
