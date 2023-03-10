import { Type } from '@freik/core-utils';
import {
  GetPlainValue,
  MakeDeclDef,
  MakeDefinitions,
  MakeIfeq,
  MakeMenuOptions,
} from './mkutil.js';
import type {
  Board,
  BoardFile,
  Definition,
  FilterFunc,
  ParsedFile,
  SimpleSymbol,
  SymbolTable,
} from './types.js';

// This spits out the board configuration data in Makefile format
// It returns the set of *probably* defined variables, for use later
export function BuildBoard(board: ParsedFile): Definition[] {
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

// Get the menu "parent" from the parsed file
function getMenus(parsedFile: ParsedFile): SymbolTable {
  const menuSym = parsedFile.scopedTable.get('menu');
  if (Type.isUndefined(menuSym)) {
    return new Map<string, SimpleSymbol>();
  }
  return menuSym.children;
}

// Create an individual board from the symbols we've got.
function makeBoard(val: SimpleSymbol, menus: SymbolTable): Board {
  const menuSelections =
    val.children.get('menu')?.children || new Map<string, SimpleSymbol>();
  // Validate that the menu selections are available in the menu options enumerated
  menuSelections.forEach((ss: SimpleSymbol, key: string) => {
    if (!menus.has(key)) {
      // eslint-disable-next-line no-console
      console.error(
        `Boards.txt file looks malformed: Missing ${key} from the menu list`,
      );
    }
  });
  const symbols = new Map<string, SimpleSymbol>(
    [...val.children.entries()].filter(
      ([key]: [key: string, sym: SimpleSymbol]) => key !== 'menu',
    ),
  );
  return { menuSelections, symbols };
}

// Create a board for each board in the parsed file
export function EnumerateBoards(board: ParsedFile): BoardFile {
  const menus = getMenus(board);
  const boards = new Map<string, Board>();
  board.scopedTable.forEach((val: SimpleSymbol, key: string) => {
    if (key !== 'menu') {
      const boardId = key;
      boards.set(boardId, makeBoard(val, menus));
    }
  });
  return { menus, boards };
}
