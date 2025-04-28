import type {
  Board,
  BoardsList,
  Condition,
  Definition,
  FilterFunc,
  SimpleSymbol,
} from '../types';
import { GetPlainValue } from '../values';
import { MakeDeclDef, MakeDefinitions, MakeIfeq } from './gmUtils';

function makeMenuOption(toDump: SimpleSymbol, initConds: Condition[]) {
  const defined: Definition[] = [];
  const makeVarName = 'IN_' + toDump.name.toUpperCase();
  for (const item of toDump.children.values()) {
    const cn = MakeIfeq('${' + makeVarName + '}', item.name);
    const subDef = MakeDefinitions(item, GetPlainValue, [...initConds, cn]);
    subDef.forEach((def: Definition) => {
      def.dependsOn.push(makeVarName);
    });
    defined.push(...subDef);
  }
  return defined;
}

const notMenu: FilterFunc = (a: SimpleSymbol): boolean => a.name !== 'menu';

// This spits out the board configuration data in Makefile format
// It returns the set of *probably* defined variables, for use later
// TODO: Hoist common IF's for the menu options (Go look at Teensy...)
export function GenBoardDefs(board: BoardsList): Definition[] {
  const defined: Definition[] = [
    MakeDeclDef('BUILD_PROJECT_NAME', '${PROJ_NAME}', ['PROJ_NAME'], []),
  ];
  board.boards.forEach(({ symbols, menuSelections }: Board, key: string) => {
    // Handle each board-specific definition
    const brd = MakeIfeq('${BOARD_NAME}', key);
    const defVars = MakeDefinitions(symbols, GetPlainValue, [brd], notMenu);
    defVars.forEach((def: Definition) => def.dependsOn.push('BOARD_NAME'));
    defined.push(...defVars);
    // Now handle the menu selections for the board
    menuSelections
      .map((ss) => makeMenuOption(ss, [brd]))
      .forEach((defs) => defined.push(...defs));
  });
  return defined;
}
