import type { Definition, FilterFunc, ParsedFile } from '../types.js';
import { GetPlainValue } from '../utils.js';
import {
  MakeDeclDef,
  MakeDefinitions,
  MakeIfeq,
  MakeMenuOptions,
} from './gmUtils.js';

// This spits out the board configuration data in Makefile format
// It returns the set of *probably* defined variables, for use later
export function GenBoardDefs(board: ParsedFile): Definition[] {
  let menus: Set<string> = new Set();
  let defined: Definition[] = [
    MakeDeclDef('BUILD_PROJECT_NAME', '${PROJ_NAME}', ['PROJ_NAME'], []),
  ];
  for (const item of board.scopedTable.values()) {
    if (item.name === 'menu') {
      // AFAICT, top level 'menu' items indicate later nested options
      const children = item.children;
      menus = new Set([...menus, ...children.keys()]);
    } else {
      const brd = MakeIfeq('${BOARD_NAME}', item.name);
      const notMenu: FilterFunc = (a) => a.name !== 'menu';
      const defVars = MakeDefinitions(
        item,
        GetPlainValue,
        board,
        [brd],
        notMenu,
      );
      defVars.forEach((def: Definition) => {
        def.dependsOn.push('BOARD_NAME');
      });
      const defMore = MakeMenuOptions(item, board, menus, [brd]);
      defined = [...defined, ...defVars, ...defMore];
    }
  }
  return defined;
}
