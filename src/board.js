// @flow
// @format

const mkutil = require('./mkutil.js');

/*::
import type {
  Variable, SymbolTable, FlatTable, NamedTable, ParsedFile,
} from './types.js';
*/

// This spits out the board configuration data in Makefile format
// It returns the set of *probably* defined variables, for use later
// TODO: Handle the !@#$ dependency in the Adafruit board.txt on platform.txt
const dumpBoard = (board/*:ParsedFile*/)/*:Set<string>*/ => {
  let first = true;
  let menus/*:Set<string>*/ = new Set();
  let defined/*:Set<string>*/ = new Set();
  for (let item of board.scopedTable.values()) {
    if (item.name === 'menu') {
      // AFAICT, top level 'menu' items indicate later nested options
      const children = item.children;
      menus = new Set([...menus, ...children.keys()]);
    } else {
      console.log(`${first ? 'ifeq' : 'else ifeq'} ($(INPUT_BOARD), ${item.name})`);
      first = false;
      const defVars = mkutil.dumpVars('\t', item, board, a => a.name !== 'menu');
      const defMore = mkutil.dumpMenuOptions(item, board, menus);
      defined = new Set([...defined, ...defVars, ...defMore]);
    }
  }
  if (!first) {
    console.log('else');
    console.log('\t$(error Unknown or undefined INPUT_BOARD target)');
    console.log('endif');
  }
  return defined;
};

module.exports = dumpBoard;
