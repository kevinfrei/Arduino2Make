// @flow
// @format

const mkutil = require('./mkutil.js');
const { makeIfeq } = mkutil;

import type {
  Variable,
  SymbolTable,
  NamedTable,
  ParsedFile,
  Condition,
  Definition
} from './types.js';

// This spits out the board configuration data in Makefile format
// It returns the set of *probably* defined variables, for use later
const dumpBoard = (board: ParsedFile): Array<Definition> => {
  let menus: Set<string> = new Set();
  let defined: Array<Definition> = [];
  for (let item of board.scopedTable.values()) {
    if (item.name === 'menu') {
      // AFAICT, top level 'menu' items indicate later nested options
      const children = item.children;
      menus = new Set([...menus, ...children.keys()]);
    } else {
      const brd = makeIfeq('${INPUT_BOARD}', item.name);
      const notMenu = a => a.name !== 'menu';
      const defVars = mkutil.makeDefinitions(
        item,
        mkutil.getPlainValue,
        board,
        [brd],
        notMenu
      );
      defVars.forEach((def:Definition) => {
        def.dependsOn.push('INPUT_BOARD');
      });
      const defMore = mkutil.makeMenuOptions(item, board, menus, [brd]);
      defined = [...defined, ...defVars, ...defMore];
    }
  }
  return defined;
};

module.exports = dumpBoard;
