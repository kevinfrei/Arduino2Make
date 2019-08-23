// @flow
// @format

const mkutil = require('./mkutil.js');
const { definition: def, condition: cond } = mkutil;

import type {
  Variable,
  SymbolTable,
  FlatTable,
  NamedTable,
  ParsedFile,
  Condition,
  Definition
} from './types.js';

// This spits out the board configuration data in Makefile format
// It returns the set of *probably* defined variables, for use later
// TODO: Handle the !@#$ dependency in the Adafruit board.txt on platform.txt
const dumpBoard = (board: ParsedFile): Array<Definition> => {
  let menus: Set<string> = new Set();
  let defined: Array<Definition> = [];
  for (let item of board.scopedTable.values()) {
    if (item.name === 'menu') {
      // AFAICT, top level 'menu' items indicate later nested options
      const children = item.children;
      menus = new Set([...menus, ...children.keys()]);
    } else {
      const brd = cond('ifeq', '${INPUT_BOARD}', item.name);
      const notMenu = a => a.name !== 'menu';
      const defVars = mkutil.makeDefinitions(
        item,
        mkutil.getPlainValue,
        board,
        [brd],
        notMenu
      );
      const defMore = mkutil.makeMenuOptions(item, board, menus, [brd]);
      defined = [...defined, ...defVars, ...defMore];
    }
  }
  return defined;
};

module.exports = dumpBoard;
