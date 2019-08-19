// @flow
// @format

const mkutil = require('./mkutil.js');

import type {
  Variable,
  SymbolTable,
  FlatTable,
  NamedTable,
  ParsedFile,
  Definition,
  FilterFunc
} from './types.js';

// Not sure if I need to deal with this stuff
// Adafruit, this is just bootloader crap, so I haven't done anything for it
const dumpProgrammer = (
  board: Array<Definition>,
  platform: Array<Definition>,
  programmer: ParsedFile
) => {
  console.log('# TODO: maybe generate Programmer stuff?');
};

module.exports = dumpProgrammer;
