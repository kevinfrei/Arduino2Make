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
  'BUILD_FLAGS_C',
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

const getSpaces = (len: number): string => {
  let str = '';
  while (--len >= 0) str += '  ';
  return str;
};

const openConditions = (conds: Array<Condition>, begin: number) => {
  for (let i = begin; i < conds.length; i++) {
    const cond = conds[i];
    const sp = getSpaces(i);
    if (cond.op === 'neq' || cond.op === 'eq') {
      console.log(`${sp}if${cond.op} (${cond.variable}, ${cond.value})`);
    } else {
      console.log(`${sp}if${cond.op} ${cond.variable}`);
    }
  }
};

const closeConditions = (indent: number, count: number) => {
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
  const pCnd: Condition = prevCond[index];
  const nCnd: Condition = newCond[index];
  if (pCnd.variable !== nCnd.variable) {
    // If they're not operating on the same variable, no optimization
    // Close the previous uncommon conditions
    closeConditions(prevCond.length, prevCond.length - index);
    // open the new uncommon conditions
    openConditions(newCond, index);
  }
  // We're operating on the same variable name
  // This should be 'both are undefined, or both are the same string'
  else if (
    (pCnd.value && nCnd.value && pCnd.value === nCnd.value) ||
    (pCnd.value === undefined && nCnd.value === undefined)
  ) {
    if (pCnd.op === nCnd.op) {
      // Same condition: no change necessary, just recurse!
      handleCondition(prevCond, newCond, index + 1);
    } else if (
      // different operations...
      (pCnd.op === 'neq' && nCnd.op === 'eq') ||
      (pCnd.op === 'eq' && nCnd.op === 'neq') ||
      (pCnd.op === 'def' && nCnd.op === 'ndef') ||
      (pCnd.op === 'ndef' && nCnd.op === 'def')
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
  else if (pCnd.op === 'eq' && nCnd.op === 'eq') {
    // Checking equality to the same variable, but with different value: else if
    // First close out prevConds,
    closeConditions(prevCond.length, prevCond.length - index - 1);
    // Spit out the else-if
    console.log(
      `${getSpaces(index)}else ifeq (${nCnd.variable}, ${nCnd.value})`
    );
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
const opMap: Map<string, string> = new Map([
  ['decl', '='],
  ['seq', ':='],
  ['add', '+='],
  ['?decl', '?=']
]);
const emitDefs = (defs: Array<Definition>) => {
  console.log('# And here are all the definitions');
  let prevCond: Array<Condition> = [];
  //  let depth = '';
  defs.forEach((def: Definition) => {
    const curCond = def.condition.length > 0 ? def.condition : [];
    /*depth =*/ handleCondition(prevCond, curCond, 0);
    const indent = getSpaces(def.condition.length);
    const assign = opMap.get(def.type);
    if (assign) {
      console.log(`${indent}${def.name}${assign}${def.value}`);
    }
    prevCond = curCond;
  });
  closeConditions(prevCond.length - 1, prevCond.length);
};

const emitRules = (rules: Array<Recipe>) => {
  // Check to see what our flash target depends on
  // TODO: Not sure what to do if we have multiple flash targets :/
  const flashRules = rules.filter((r: Recipe) => r.dst === 'flash');
  const targetSuffix: string =
    flashRules.length > 0 ? flashRules.pop().src : 'unk';
  console.log(`
# And now the build rules!

# First, the phony rules that don't product things
.PHONY: $\{PROJ_NAME\} flash clean allclean

# Now the default target
all: $\{BUILD_PATH\} $\{PROJ_NAME\}

# Some house keeping
clean:
\t-rm $\{USER_OBJS\}

allclean:
\t-rm -rf $\{BUILD_PATH\}

# Make us rebuild user code if the makefile(s) change:
# Needs to be above the deps thing, I think
$\{USER_OBJS\} : $(MAKEFILE_LIST)

# Let's start using the generated .d files...
-include $(ALL_OBJS:.o=.d)

# Next, the project name shortcut, because it's easier
$\{PROJ_NAME\}: $\{BUILD_PATH\}/$\{PROJ_NAME\}.${targetSuffix}

# Add a 'flash' target
flash: $\{BUILD_PATH\}/$\{PROJ_NAME\}.flash

# And finally, create the director
# TODO: This no worky on Windows fer sure
$\{BUILD_PATH\}:
\ttest -d "$@" || mkdir "$@"

# Now, on to the actual rules`);
  rules.forEach((rule: Recipe) => {
    console.log('');
    if (rule.dst === 'o') {
      console.log(`$\{BUILD_PATH\}/%.${rule.src}.o : %.${rule.src}`);
      let cmd = rule.command;
      let sfx = rule.src.toUpperCase();
      const flg = `$\{COMPILER_${sfx}_EXTRA_FLAGS\} `;
      if (cmd.indexOf(flg) < 0) {
        let loc = cmd.indexOf('"$<"');
        cmd = cmd.substr(0, loc) + flg + cmd.substr(loc);
      }
      console.log('\t' + cmd);
    } else if (rule.dst === 'a') {
      console.log('${BUILD_PATH}/system.a : ${SYS_OBJS}');
      console.log(`\t${rule.command}`);
    } else if (rule.dst === 'elf') {
      console.log(
        '${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf : ' +
          '${BUILD_PATH}/system.a ${USER_OBJS}'
      );
      console.log(`\t${rule.command}`);
    } else {
      console.log(
        '${BUILD_PATH}/${BUILD_PROJECT_NAME}.' +
          rule.dst +
          ' : ${BUILD_PATH}/${BUILD_PROJECT_NAME}.' +
          rule.src
      );
      console.log(`\t${rule.command}`);
    }
  });
};

module.exports = {
  order,
  emitChecks,
  emitDefs,
  emitRules
};
