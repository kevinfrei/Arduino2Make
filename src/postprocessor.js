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

const order = (
  defs: Array<Definition>,
  rules: Array<Recipe>
): { checks: Array<string>, defs: Array<Definition> } => {
  // Don't know if I'll need the rules or not

  // First, let's identify all the mandatory user-defined symbols
  const allDefs = new Set(defs.map(d => d.name));
  const allDeps = new Set([].concat(...defs.map(d => d.dependsOn)));
  // Remove allDefs from allDeps
  const checks: Array<string> = [...allDeps].filter(x => !allDefs.has(x));

  // Arbitrarily sort the definitions
  const sorted = defs.sort((a:Definition) => a.name);

  return { checks, defs: sorted };
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
