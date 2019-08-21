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
  // Clear out known optional values
  optionalDefs.forEach(a => checks.delete(a));

  // Sort the definitions in dependent order

  return { checks: [...checks.keys()], defs };
};

const emitChecks = (checks: Array<string>) => {
  console.log('Emitting checks!');
};

const emitDefs = (defs: Array<Definition>) => {
  console.log('Emitting definitions!');
};

const emitRules = (rules: Array<Recipe>) => {
  console.log('Emitting rules!');
};

module.exports = {
  order,
  emitChecks,
  emitDefs,
  emitRules
};
