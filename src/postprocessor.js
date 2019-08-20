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
  return { checks: [], defs };
};

const emitChecks = (checks: Array<string>) => {
  console.log('Emitting checks!');
};

const emitDefs = (defs:Array<Definition>) => {
  console.log('Emitting definitions!');
};

const emitRules = (rules:Array<Recipe>) => {
  console.log('Emitting rules!');
};

module.exports = {
  order,
  emitChecks,
  emitDefs,
  emitRules
};
