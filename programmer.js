// @flow
// @format

const mkutil = require('./mkutil.js');

/*::
import type {
  Variable, SymbolTable, FlatTable, NamedTable, ParsedFile,
  ResolvedValue, FilterFunc} from './types.js';
*/

// Not sure if I need to deal with this stuff
// Adafruit, this is just bootloader crap, so I haven't done anything for it
const dumpProgrammer = (
  board/*:Set<string>*/,
  platform/*:Set<string>*/,
  programmer/*:ParsedFile*/
) => {
  console.log('# TODO: maybe generate Programmer stuff?');
  //  console.log(programmer);
};

module.exports = dumpProgrammer;
