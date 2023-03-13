import { Type } from '@freik/core-utils';
import type { Board, BoardsList, ParsedFile, SimpleSymbol } from './types.js';

// Get the menu "parent" from the parsed file
// This is a map of "ID" to the actual title of the user menu
function getMenus(parsedFile: ParsedFile): Map<string, string> {
  const menuSym = parsedFile.scopedTable.get('menu');
  if (Type.isUndefined(menuSym)) {
    return new Map<string, string>();
  }
  return new Map<string, string>(
    [...menuSym.children].map(([id, sym]) => [id, sym.name]),
  );
}

// Create an individual board from the symbols we've got.
function makeBoard(val: SimpleSymbol, menus: Map<string, string>): Board {
  const menuSyms =
    val.children.get('menu')?.children || new Map<string, SimpleSymbol>();
  // Validate that the menu selections are available in the menu options enumerated
  const menuSelections: SimpleSymbol[] = [];
  menuSyms.forEach((ss: SimpleSymbol, key: string) => {
    if (!menus.has(key)) {
      // TODO: Throw an error here? Make a 'warning' level?
      // eslint-disable-next-line no-console
      console.error(
        `Boards.txt file looks malformed: Missing ${key} from the menu list`,
      );
    } else {
      menuSelections.push(ss);
    }
  });
  return { menuSelections, symbols: val };
}

// Create a board for each board in the parsed file
export function EnumerateBoards(board: ParsedFile): BoardsList {
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
