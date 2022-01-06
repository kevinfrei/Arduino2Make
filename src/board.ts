import {
  getPlainValue,
  makeDeclDef as mkdef,
  makeDefinitions,
  makeIfeq,
  makeMenuOptions,
} from './mkutil.js';
import type { Definition, FilterFunc, ParsedFile } from './types.js';

// This spits out the board configuration data in Makefile format
// It returns the set of *probably* defined variables, for use later
export function buildBoard(board: ParsedFile): Definition[] {
  let menus: Set<string> = new Set();
  let defined: Definition[] = [
    mkdef('BUILD_PROJECT_NAME', '${PROJ_NAME}', ['PROJ_NAME'], []),
  ];
  for (const item of board.scopedTable.values()) {
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
        notMenu,
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
