// @flow
// @format

// Utilities for doing Makefile stuff

import type {
  Variable,
  SymbolTable,
  FlatTable,
  NamedTable,
  ParsedFile,
  DependentValue,
  Condition,
  Definition,
  Recipe
} from './types.js';

const optionalDefs: Array<string> = [
  'INCLUDES',
  'COMPILER_S_EXTRA_FLAGS',
  'COMPILER_C_EXTRA_FLAGS',
  'COMPILER_CPP_EXTRA_FLAGS',
  'UPLOAD_VERBOSE'
];

const order = (
  defs: Array<Definition>,
  rules: Array<Recipe>
): { checks: Array<string>, defs: Array<Definition> } => {
  // Don't know if I'll need the rules or not

  // First, let's identify all the mandatory user-defined symbols
  const allDefs = new Set(defs.map(d => d.name));
  const allDeps = new Set(
    [].concat(...defs.map(d => d.dependsOn), ...rules.map(rec => rec.dependsOn))
  );
  // Remove allDefs from allDeps
  const checks: Set<string> = new Set(
    [...allDeps].filter(x => !allDefs.has(x))
  );
  const done: Set<string> = new Set(checks);
  // Clear out known optional values
  optionalDefs.forEach(a => checks.delete(a));

  // Now checks has the list of all undefined symbols
  // These should have checks emitted in the makefile to validate that the user
  // has defined them already (or have defaults assigned if that's unimportant)

  const allDefined = (def: Definition): boolean => {
    for (let d of def.dependsOn) {
      if (!done.has(d)) {
        return false;
      }
    }
    return true;
  };
  const ordered: Array<Definition> = [];
  const stillPending: Map<string, number> = new Map();
  defs.forEach((d: Definition) => {
    let val = stillPending.get(d.name);
    if (typeof val !== 'number') {
      val = 0;
    }
    stillPending.set(d.name, val + 1);
  });
  // This is such a lame, slow sorting algorithm. I really should do better...
  const skip: Set<number> = new Set();
  for (let i = 0; i < defs.length; i++) {
    if (!skip.has(i)) {
      if (allDefined(defs[i])) {
        ordered.push(defs[i]);
        done.add(defs[i].name);
        skip.add(i);
        i = -1;
      }
    }
  }

  return { checks: [...checks.keys()], defs: ordered };
};

const emitChecks = (checks: Array<string>) => {
  console.log('# First, add some errors for undefined values');
  checks.forEach((val: string) => {
    console.log(`ifndef ${val}`);
    console.log(` $(error ${val} is not defined!)`);
    console.log('endif');
  });
};

const emitDefs = (defs: Array<Definition>) => {
  console.log('# And here are all the definitions');
  console.log('# with maximally unoptimized condition checks');
  defs.forEach((def: Definition) => {
    if (def.condition) {
      const { op, variable, value } = def.condition;
      console.log(`${op} (${variable}, ${value})`);
    }
    console.log(`${def.name}=${def.value}`);
    if (def.condition) {
      console.log('endif');
    }
  });
};

const emitRules = (rules: Array<Recipe>) => {
  console.log('# And now the build rules!');

};

module.exports = {
  order,
  emitChecks,
  emitDefs,
  emitRules
};
