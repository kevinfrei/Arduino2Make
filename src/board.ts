// @flow
// @format

import {
  makeIfeq,
  makeDeclDef as mkdef,
  makeDefinitions,
  getPlainValue,
  makeMenuOptions,
} from './mkutil';

import type {
  Variable,
  SymbolTable,
  NamedTable,
  FilterFunc,
  ParsedFile,
  Condition,
  Definition,
} from './types.js';

// This spits out the board configuration data in Makefile format
// It returns the set of *probably* defined variables, for use later
export default function buildBoard(board: ParsedFile): Array<Definition> {
  let menus: Set<string> = new Set();
  let defined: Array<Definition> = [
    mkdef('BUILD_PROJECT_NAME', '${PROJ_NAME}', ['PROJ_NAME'], []),
  ];
  for (let item of board.scopedTable.values()) {
    if (item.name === 'menu') {
      // AFAICT, top level 'menu' items indicate later nested options
      const children = item.children;
      menus = new Set([...menus, ...children.keys()]);
    } else {
      const brd = makeIfeq('${BOARD_NAME}', item.name);
      const notMenu: FilterFunc = (a) => a.name !== 'menu';
      const defVars = makeDefinitions(
        item,
        getPlainValue,
        board,
        [brd],
        notMenu
      );
      defVars.forEach((def: Definition) => {
        def.dependsOn.push('BOARD_NAME');
      });
      const defMore = makeMenuOptions(item, board, menus, [brd]);
      defined = [...defined, ...defVars, ...defMore];
    }
  }
  return defined;
}
