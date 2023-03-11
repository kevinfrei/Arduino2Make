import { Type } from '@freik/core-utils';
import type {
  Board,
  BoardFile,
  ParsedFile,
  SimpleSymbol,
  SymbolTable,
} from './types.js';

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
