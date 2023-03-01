// Utilities for doing Makefile stuff

import path from 'path';
import { Transform } from '../config.js';
import { CalculateChecksAndOrderDefinitions, dump } from '../main.js';
import { makeDeclDef, makeIfeq, makeIfneq, makeUnDecl } from '../mkutil.js';
import type { Condition, Definition, Recipe } from '../types.js';

const optionalDefs: string[] = [
  'INCLUDES',
  'BUILD_FLAGS_C',
  'COMPILER_S_EXTRA_FLAGS',
  'COMPILER_C_EXTRA_FLAGS',
  'COMPILER_CPP_EXTRA_FLAGS',
  'COMPILER_C_ELF_EXTRA_FLAGS',
  'COMPILER_LD_EXTRA_FLAGS',
  'COMPILER_AR_EXTRA_FLAGS',
  'COMPILER_ELF_EXTRA_FLAGS',
  'COMPILER_ELF2HEX_EXTRA_FLAGS',
  'COMPILER_AR_EXTRA_FLAGS',
  'UPLOAD_VERBOSE',
];

function emitChecks(checks: string[]) {
  dump()('# First, add some errors for undefined values');
  checks.forEach((val: string) => {
    dump()(`ifndef ${val}`);
    dump()(`  $(error ${val} is not defined!)`);
    dump()('endif');
  });
  dump()(`
# Check for some source files
ifeq ($\{USER_C_SRCS}$\{USER_CPP_SRCS}$\{USER_S_SRCS},)
  $(error You must define USER_C_SRCS, USER_CPP_SRCS, or USER_S_SRCS)
endif
`);
}

function getSpaces(len: number): string {
  let str = '';
  while (--len >= 0) str += '  ';
  return str;
}

function openConditions(conds: Condition[], begin: number) {
  for (let i = begin; i < conds.length; i++) {
    const cond = conds[i];
    const sp = getSpaces(i);
    if (cond.op === 'neq' || cond.op === 'eq') {
      dump()(`${sp}if${cond.op} (${cond.variable}, ${cond.value || ''})`);
    } else if (cond.op !== 'raw') {
      dump()(`${sp}if${cond.op} ${cond.variable}`);
    } else {
      dump()(`${sp}if ${cond.variable}`);
    }
  }
}

function closeConditions(indent: number, count: number) {
  while (count--) {
    dump()(`${getSpaces(--indent)}endif`);
  }
}

// Recursive, so I can convince myself that it works
function handleCondition(
  prevCond: Condition[],
  newCond: Condition[],
  index: number,
) {
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
      dump()(`${getSpaces(index)}else`);
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
    dump()(
      `${getSpaces(index)}else ifeq (${nCnd.variable}, ${nCnd.value || ''})`,
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
}

const opMap: Map<string, string> = new Map([
  ['decl', '='],
  ['seq', ':='],
  ['add', '+='],
  ['?decl', '?='],
]);

function emitDefs(defs: Definition[]) {
  dump()('# And here are all the definitions');
  let prevCond: Condition[] = [];
  //  let depth = '';
  defs.forEach((def: Definition) => {
    const curCond = def.condition.length > 0 ? def.condition : [];
    /* depth = */ handleCondition(prevCond, curCond, 0);
    const indent = getSpaces(def.condition.length);
    const assign = opMap.get(def.type);
    if (assign) {
      const { name, value } = Transform(def.name, def.value);
      dump()(`${indent}${name}${assign}${value}`);
    }
    prevCond = curCond;
  });
  closeConditions(prevCond.length - 1, prevCond.length);
}

// This is currently more art than science :/
function slashify(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\\\\\"').replace(/'/g, '');
}

function emitRules(rules: Recipe[]) {
  // Check to see what our flash target depends on
  // TODO: Not sure what to do if we have multiple flash targets :/
  const flashRules = rules.filter((r: Recipe) => r.dst === 'flash');
  const tmp = flashRules.pop();
  const targetSuffix: string = tmp ? tmp.src : 'unk';
  dump()(`
# And now the build rules!

# First, the phony rules that don't produce things
.PHONY: $\{PROJ_NAME\} flash clean allclean

# Now the default target
all: $\{BUILD_PATH\} $\{PROJ_NAME\}

# Some house keeping
clean:
\t-rm $\{USER_OBJS\} $\{USER_EXTRA\}

allclean: clean
\t-rm -rf $\{BUILD_PATH\}

# Make us rebuild user code if the makefile(s) change:
# Needs to be above the deps thing, I think
$\{USER_OBJS\} : $(MAKEFILE_LIST)

# Let's start using the generated .d files...
-include $(ALL_OBJS:.o=.d)

# Next, the project name shortcut, because it's easier
$\{PROJ_NAME\}: $\{BUILD_PATH\} $\{BUILD_PATH\}/$\{PROJ_NAME\}.${targetSuffix}

# Add a 'flash' target
flash: $\{BUILD_PATH\}/$\{PROJ_NAME\}.flash

# And finally, create the directory
$\{BUILD_PATH\}:
ifeq ($(OS),Windows_NT)
\t-@mkdir "$@"
else
\t@test -d "$@" || mkdir -p "$@"
endif

# Now, on to the actual rules`);
  // const jsonFiles: string[] = [];
  rules.forEach((rule: Recipe) => {
    dump()('');
    if (rule.dst === 'o') {
      dump()(`$\{BUILD_PATH\}/%.${rule.src}.o : %.${rule.src}`);
      const sfx = rule.src.toUpperCase();
      const cmd = tryToAddUserExtraFlag(sfx, '"$<"', rule.command);
      dump()(`\t${cmd}\n`);
      // Also, let's make the .json compile_commands target
      dump()(`$\{BUILD_PATH\}/%.${rule.src}.json : %.${rule.src}`);
      dump()('ifeq ($(OS),Windows_NT)');
      // Windows Specific for loop and echo here
      dump()('\t@echo { "directory":"$(<D)", "file":"$(<F)", "command": > $@');
      dump()(`\t@echo "${cmd.replaceAll('"', '\\"')}" >> $@`);
      dump()('\t@echo }, >> $@');
      dump()('else');
      // *nix Shell for loop/echo here
      dump()(
        '\t@echo "{ \\"directory\\": \\"$(<D)\\",\\"file\\":\\"$(<F)\\"," > $@',
      );
      dump()('\t@echo "\\"command\\":\\"' + slashify(cmd) + '\\"}," >> $@');
      dump()('endif');
    } else if (rule.dst === 'a') {
      dump()('${BUILD_PATH}/system.a : ${SYS_OBJS}');
      const cmd = tryToAddUserExtraFlag('AR', 'rcs "$@"', rule.command);
      dump()(`\t${cmd}\n`);
    } else if (rule.dst === 'elf') {
      dump()(
        '${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf : ' +
          '${BUILD_PATH}/system.a ${USER_OBJS}',
      );
      const cmd = tryToAddUserExtraFlag('ELF', '-o "$@"', rule.command);
      dump()(`\t${cmd}\n`);
    } else {
      dump()(
        '${BUILD_PATH}/${BUILD_PROJECT_NAME}.' +
          rule.dst +
          ' : ${BUILD_PATH}/${BUILD_PROJECT_NAME}.' +
          rule.src,
      );
      dump()(`\t${rule.command}`);
    }
  });
  dump()(`\n
$\{BUILD_PATH}/compile_commands.json: $\{USER_JSON} $\{SYS_JSON}
ifeq ($(OS),Windows_NT)
\t@echo [ > $@
\t@sed -e "s/ / /" $^ >> $@
\t@echo {}] >> $@
else
\t@echo "[" > $@.tmp
\t@cat $^ >> $@.tmp
\t@echo "]" >> $@.tmp
\t@sed -e ':a' -e 'N' -e '$$!ba' -e 's/},\\n]/}]/g' $@.tmp > $@
endif

compile_commands: $\{BUILD_PATH} $\{BUILD_PATH}/compile_commands.json`);
}
function tryToAddUserExtraFlag(sfx: string, srch: string, cmd: string) {
  const flg = `$\{COMPILER_${sfx}_EXTRA_FLAGS\} `;
  if (cmd.indexOf(flg) < 0) {
    const loc = cmd.indexOf(srch);
    if (loc > 0) cmd = cmd.substring(0, loc) + flg + cmd.substring(loc);
  }
  return cmd;
}

export function Emit(
  platform: string,
  boardDefined: Definition[],
  platDefs: Definition[],
  rules: Recipe[],
): void {
  const isWin = makeIfeq('$(OS)', 'Windows_NT');
  const notWin = makeIfneq('$(OS)', 'Windows_NT');
  const isMac = makeIfeq('$(uname)', 'Darwin');
  // const notMac = makeIfneq('$(uname)', 'Darwin');
  const initial = [
    makeDeclDef('RUNTIME_OS', 'windows', [], [isWin]),
    makeDeclDef('uname', '$(shell uname -s)', [], [notWin]),
    makeDeclDef('RUNTIME_OS', 'macosx', ['uname'], [notWin, isMac]),
    makeUnDecl('RUNTIME_OS', 'linux'),
    makeDeclDef(
      'RUNTIME_PLATFORM_PATH',
      path.dirname(platform).replaceAll('\\', '/'),
    ),
    makeDeclDef('RUNTIME_IDE_VERSION', '10819'),
    makeDeclDef('IDE_VERSION', '10819'),
  ];

  // Make definitions dependent on their condition values, so that I can
  // put errors in place when mandatory symbols aren't defined before inclusion
  const { checks, defs } = CalculateChecksAndOrderDefinitions(
    [...initial, ...boardDefined, ...platDefs],
    rules,
    optionalDefs,
  );
  emitChecks(checks);
  emitDefs(defs);
  emitRules(rules);
}
