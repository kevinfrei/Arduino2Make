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
    console.log(`  $(error ${val} is not defined!)`);
    console.log('endif');
  });
};

const handleCondition = (
  prevCond: ?Condition,
  newCond: ?Condition,
  depth: string
): string => {
  // Some quick, early exits:
  if (!prevCond && !newCond) {
    // No conditions before or after
    return depth;
  }
  // stuff on newCond make Flow stop whining :/
  if (!prevCond && newCond !== null && newCond !== undefined) {
    // No previous only new
    console.log(
      `${depth}${newCond.op} (${newCond.variable}, ${newCond.value})`
    );
    return depth + '  ';
  }
  const opIndent: string = depth.substr(0, depth.length - 2);
  if (!newCond) {
    console.log(opIndent + 'endif');
    return opIndent;
  }
  if (!prevCond) {
    console.error('NFW: This is here for Flow :/');
    return opIndent;
  }
  // Now we have transitions to optimize
  const { op: pop, variable: pvar, value: pval } = prevCond;
  const { op: nop, variable: nvar, value: nval } = newCond;
  if (pvar !== nvar) {
    // If they're not operating on the same variable, no optimization
    console.log(opIndent + 'endif');
    console.log(`${opIndent}${nop} (${nvar}, ${nval})`);
    return depth;
  }
  if (pval === nval) {
    if (pop === nop) {
      // Same condition: no output necessary
    } else if ((pop === 'ifneq' && nop === 'ifeq') ||
    (pop === 'ifeq' && nop === 'ifneq')) {
      // Opposite conditions on the same value & variable, plain 'else'
      console.log(opIndent + 'else');
    } else {
      // Same value & variable, but different condition, no opt
    console.log(opIndent + 'endif');
    console.log(`${opIndent}${nop} (${nvar}, ${nval})`);
    }
      return depth;
  }
  // different values
  if (pop === 'ifeq' && nop === 'ifeq') {
    // Checking equality to the same variable, but with different value: else if
    console.log(`${opIndent}else ${nop} (${nvar}, ${nval})`);
  } else {
    // Same variable, different value, but other ops, no optimization
    console.log(opIndent + 'endif');
    console.log(`${opIndent}${nop} (${nvar}, ${nval})`);
  }
  return depth;
};

const emitDefs = (defs: Array<Definition>) => {
  console.log('# And here are all the definitions');
  let prevCond: ?Condition;
  let depth = '';
  defs.forEach((def: Definition) => {
    const curCond = (def.condition.length > 0) ? def.condition[0] : undefined;
    depth = handleCondition(prevCond, curCond, depth);
    console.log(`${depth}${def.name}=${def.value}`);
    prevCond = curCond;
  });
  if (prevCond) {
    console.log('endif');
  }
};

const emitRules = (rules: Array<Recipe>) => {
  console.log('# And now the build rules!');
  rules.forEach((rule: Recipe) => {
    console.log('');
    console.log(`%.${rule.dst}:%.${rule.src}`);
    console.log(`\t${rule.command}`);
  });
};

module.exports = {
  order,
  emitChecks,
  emitDefs,
  emitRules
};
