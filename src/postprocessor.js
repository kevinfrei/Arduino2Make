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
  'COMPILER_C_ELF_EXTRA_FLAGS',
  'COMPILER_ELF2HEX_EXTRA_FLAGS',
  'COMPILER_AR_EXTRA_FLAGS',
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
  console.log(`
# Check for some source files
ifeq ($\{USER_C_SRCS}$\{USER_CPP_SRCS}$\{USER_S_SRCS},)
  $(error You must define USER_C_SRCS, USER_CPP_SRCS, or USER_S_SRCS)
endif
`);
};

const itemEqual = (a: Condition, b: Condition): boolean => {
  return a.op === b.op && a.value === b.value && a.variable === b.variable;
};

const getSpaces = (len: number): string => {
  let str = '';
  while (--len >= 0) str += '  ';
  return str;
};

const openConditions = (conds: Array<Condition>, begin: number) => {
  // TODO: Indent
  for (let i = begin; i < conds.length; i++) {
    const cond = conds[i];
    console.log(`${getSpaces(i)}${cond.op} (${cond.variable}, ${cond.value})`);
  }
};

const closeConditions = (indent: number, count: number) => {
  // TODO: Indent
  while (count--) {
    console.log(`${getSpaces(--indent)}endif`);
  }
};

// Recursive, so I can convince myself that it works
const handleCondition = (
  prevCond: Array<Condition>,
  newCond: Array<Condition>,
  index: number
) => {
  // Recursion termination conditions:
  if (index === prevCond.length && index === newCond.length) {
    // Both are done
    return;
  }
  if (index === prevCond.length) {
    // prev are done, just open new
    openConditions(newCond, index);
    return;
  }
  if (index === newCond.length) {
    // new are done, just close the prev's
    closeConditions(prevCond.length, prevCond.length - index);
    return;
  }
  // Now we have "transitions" to optimize
  const { op: pop, variable: pvar, value: pval } = prevCond[index];
  const { op: nop, variable: nvar, value: nval } = newCond[index];
  if (pvar !== nvar) {
    // If they're not operating on the same variable, no optimization
    // Close the previous uncommon conditions
    closeConditions(prevCond.length, prevCond.length - index);
    // open the new uncommon conditions
    openConditions(newCond, index);
  }
  // We're operating on the same variable name
  else if (pval === nval) {
    if (pop === nop) {
      // Same condition: no change necessary, just recurse!
      handleCondition(prevCond, newCond, index + 1);
    } else if (
      // different operations...
      (pop === 'ifneq' && nop === 'ifeq') ||
      (pop === 'ifeq' && nop === 'ifneq')
    ) {
      // Opposite conditions on the same value & variable,
      // First close out prevConds,
      closeConditions(prevCond.length, prevCond.length - index - 1);
      // then a plain 'else'
      console.log(`${getSpaces(index)}else`);
      // then open the newConds
      openConditions(newCond, index + 1);
    } else {
      // Same value & variable, but different condition, no opt
      // Close the previous uncommon conditions
      closeConditions(prevCond.length, prevCond.length - index);
      // open the new uncommon conditions
      openConditions(newCond, index);
    }
  } // different values
  else if (pop === 'ifeq' && nop === 'ifeq') {
    // Checking equality to the same variable, but with different value: else if
    // First close out prevConds,
    closeConditions(prevCond.length, prevCond.length - index - 1);
    // Spit out the else-if
    console.log(`${getSpaces(index)}else ${nop} (${nvar}, ${nval})`);
    // then open the newConds
    openConditions(newCond, index + 1);
  } else {
    // Same variable, different value, but other ops, no optimization
    // Same value & variable, but different condition, no opt
    // Close the previous uncommon conditions
    closeConditions(prevCond.length, prevCond.length - index);
    // open the new uncommon conditions
    openConditions(newCond, index);
  }
};

const emitDefs = (defs: Array<Definition>) => {
  console.log('# And here are all the definitions');
  let prevCond: Array<Condition> = [];
  //  let depth = '';
  defs.forEach((def: Definition) => {
    const curCond = def.condition.length > 0 ? def.condition : [];
    /*depth =*/ handleCondition(prevCond, curCond, 0);
    const indent = def.condition.map(a => '  ').join('');
    console.log(`${indent}${def.name}:=${def.value}`);
    prevCond = curCond;
  });
  closeConditions(prevCond.length - 1, prevCond.length);
};

const emitRules = (rules: Array<Recipe>) => {
  console.log('# And now the build rules!');
  rules.forEach((rule: Recipe) => {
    console.log('');
    if (rule.dst === 'o') {
      console.log(`$\{BUILD_PATH\}/%.${rule.src}.o : %.${rule.src}`);
    } else if (rule.dst === 'a') {
      console.log('${BUILD_PATH}/system.a : ${SYS_OBJS}');
    } else if (rule.dst === 'elf') {
      console.log(
        '${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf : ' +
          '${BUILD_PATH}/system.a ${USER_OBJS}'
      );
    } else {
      console.log(
        '${BUILD_PATH}/${BUILD_PROJECT_NAME}.' +
          rule.dst +
          ' : ${BUILD_PATH}/${BUILD_PROJECT_NAME}.' +
          rule.src
      );
    }
    console.log(`\t${rule.command}`);
  });
};

module.exports = {
  order,
  emitChecks,
  emitDefs,
  emitRules
};
