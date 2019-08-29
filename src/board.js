// @flow
// @format

const mkutil = require('./mkutil.js');
const { makeIfeq, makeDeclDef: mkdef } = mkutil;

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
  const rename = (o: string, n: string): Definition =>
    mkdef(o, `$\{${n}\}`, [n], []);
  let defined: Array<Definition> = [
    rename('INPUT_DEBUG', 'DBG_LEVEL'),
    rename('INPUT_SOFTDEVICE', 'SOFTDEVICE'),
    rename('BUILD_PROJECT_NAME', 'PROJ_NAME'),
    rename('BUILD_PATH', 'BUILD_DIR'),
    rename('BUILD_ARCH', 'CPU_ARCH'),
    rename('RUNTIME_TOOLS_ARM_NONE_EABI_GCC_PATH', 'TOOLS_PATH')
  ];
  for (let item of board.scopedTable.values()) {
    if (item.name === 'menu') {
      // AFAICT, top level 'menu' items indicate later nested options
      const children = item.children;
      menus = new Set([...menus, ...children.keys()]);
    } else {
      const brd = makeIfeq('${BOARD_NAME}', item.name);
      const notMenu = a => a.name !== 'menu';
      const defVars = mkutil.makeDefinitions(
        item,
        mkutil.getPlainValue,
        board,
        [brd],
        notMenu
      );
      defVars.forEach((def: Definition) => {
        def.dependsOn.push('BOARD_NAME');
      });
      const defMore = mkutil.makeMenuOptions(item, board, menus, [brd]);
      defined = [...defined, ...defVars, ...defMore];
    }
  }
  return defined;
};

module.exports = dumpBoard;
