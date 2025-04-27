import { platform as osplatform } from 'node:os';
import path from 'node:path';

import { Transform } from '../config.js';
import { Dump } from '../dump.js';
import { CalculateChecksAndOrderDefinitions } from '../ordering.js';
import type {
  BoardsList,
  BuildSystemHost,
  Condition,
  Definition,
  Library,
  Platform,
} from '../types.js';
import { GenBoardDefs } from './gmBoard.js';
import { BuildPlatform } from './gmPlatform.js';
import { GnuMakeRecipe } from './gmTypes.js';
import {
  MakeDeclDef,
  MakeIfeq,
  MakeIfneq,
  MakeUnDecl,
  MakifyName,
} from './gmUtils.js';

// Utilities for doing Makefile stuff

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
  Dump()('# First, add some errors for undefined values');
  checks.forEach((val: string) => {
    Dump()(`ifndef ${val}`);
    Dump()(`  $(error ${val} is not defined!)`);
    Dump()('endif');
  });
  Dump()(`
# Check for some source files
ifeq ($\{USER_C_SRCS}$\{USER_CPP_SRCS}$\{USER_S_SRCS},)
  $(error You must define USER_C_SRCS, USER_CPP_SRCS, or USER_S_SRCS)
endif
`);
}

function getSpaces(len: number): string {
  return '  '.repeat(len);
}

function openConditions(conds: Condition[], begin: number) {
  for (let i = begin; i < conds.length; i++) {
    const cond = conds[i];
    const sp = getSpaces(i);
    if (cond.op === 'neq' || cond.op === 'eq') {
      Dump()(`${sp}if${cond.op} (${cond.variable}, ${cond.value || ''})`);
    } else if (cond.op !== 'raw') {
      Dump()(`${sp}if${cond.op} ${cond.variable}`);
    } else {
      Dump()(`${sp}if ${cond.variable}`);
    }
  }
}

function closeConditions(indent: number, count: number) {
  while (count--) {
    Dump()(`${getSpaces(--indent)}endif`);
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
      Dump()(`${getSpaces(index)}else`);
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
    Dump()(
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
  Dump()('# And here are all the definitions');
  let prevCond: Condition[] = [];
  //  let depth = '';
  defs.forEach((def: Definition) => {
    const curCond = def.condition.length > 0 ? def.condition : [];
    /* depth = */ handleCondition(prevCond, curCond, 0);
    const indent = getSpaces(def.condition.length);
    const assign = opMap.get(def.type);
    if (assign) {
      const { name, value } = Transform(def.name, def.value);
      Dump()(`${indent}${name}${assign}${value}`);
    }
    prevCond = curCond;
  });
  closeConditions(prevCond.length - 1, prevCond.length);
}

function emitRules(rules: GnuMakeRecipe[]) {
  // Check to see what our flash target depends on
  // TODO: Not sure what to do if we have multiple flash targets :/
  const flashRules = rules.filter((r: GnuMakeRecipe) => r.dst === 'flash');
  const tmp = flashRules.pop();
  const targetSuffix: string = tmp ? tmp.src : 'unk';
  Dump()(`
# And now the build rules!

# First, the phony rules that don't produce things
.PHONY: $\{PROJ_NAME} flash clean allclean

# Now the default target
all: $\{BUILD_PATH} $\{PROJ_NAME}

# Some house keeping
clean:
\t-rm $\{USER_OBJS} $\{USER_EXTRA}

allclean: clean
\t-rm -rf $\{BUILD_PATH}

# Make us rebuild user code if the makefile(s) change:
# Needs to be above the deps thing, I think
$\{USER_OBJS} : $(MAKEFILE_LIST)

# Let's start using the generated .d files...
-include $(ALL_OBJS:.o=.d)

# Next, the project name shortcut, because it's easier
$\{PROJ_NAME}: $\{BUILD_PATH} $\{BUILD_PATH}/$\{PROJ_NAME}.${targetSuffix}

# Add a 'flash' target
flash: $\{BUILD_PATH}/$\{PROJ_NAME}.flash

# And finally, create the directory
$\{BUILD_PATH}:
ifeq ($(RUNTIME_OS),windows)
\t-@mkdir "$@"
else
\t@test -d "$@" || mkdir -p "$@"
endif

# Now, on to the actual rules`);
  // const jsnFiles: string[] = [];
  rules.forEach((rule: GnuMakeRecipe) => {
    Dump()('');
    if (rule.dst === 'o') {
      Dump()(`$\{BUILD_PATH}/%.${rule.src}.o : %.${rule.src}`);
      const sfx = rule.src.toUpperCase();
      const cmd = tryToAddUserExtraFlag(sfx, '"$<"', rule.command);
      Dump()(`\t${cmd}\n`);
      // Also, let's make the .jsn compile_commands target
      Dump()(`$\{BUILD_PATH}/%.${rule.src}.jsn : %.${rule.src}`);
      Dump()('\t$(file >$@,dir#$(<D))');
      Dump()('\t$(file >>$@,fil#$(<F))');
      Dump()(`\t$(file >>$@,cmd#${cmd})`);
    } else if (rule.dst === 'a') {
      Dump()('${BUILD_PATH}/system.a : ${SYS_OBJS}');
      const cmd = tryToAddUserExtraFlag('AR', 'rcs "$@"', rule.command);
      Dump()(`\t${cmd}\n`);
    } else if (rule.dst === 'elf') {
      Dump()(
        '${BUILD_PATH}/${BUILD_PROJECT_NAME}.elf : ' +
          '${BUILD_PATH}/system.a ${USER_OBJS}',
      );
      const cmd = tryToAddUserExtraFlag('ELF', '-o "$@"', rule.command);
      Dump()(`\t${cmd}\n`);
    } else {
      Dump()(
        '${BUILD_PATH}/${BUILD_PROJECT_NAME}.' +
          rule.dst +
          ' : ${BUILD_PATH}/${BUILD_PROJECT_NAME}.' +
          rule.src,
      );
      Dump()(`\t${rule.command}`);
    }
  });
  Dump()(`\n
$\{BUILD_PATH}/compile_commands.jsn: $\{USER_JSN} $\{SYS_JSN}
\t@cat $\{USER_JSN} $\{SYS_JSN} > $@

compile_commands: $\{BUILD_PATH} $\{BUILD_PATH}/compile_commands.jsn`);
}
function tryToAddUserExtraFlag(sfx: string, srch: string, cmd: string) {
  const flg = `$\{COMPILER_${sfx}_EXTRA_FLAGS} `;
  if (cmd.indexOf(flg) < 0) {
    const loc = cmd.indexOf(srch);
    if (loc > 0) cmd = cmd.substring(0, loc) + flg + cmd.substring(loc);
  }
  return cmd;
}

function getRuntimePlatformPath(): string {
  // TODO
  // {runtime.platform.path}: the absolute path of the board platform folder (i.e. the folder containing boards.txt)
  return '{runtime.platform.path}';
}

function getRuntimeHardwarePath(): string {
  // TODO
  // {runtime.hardware.path}: the absolute path of the hardware folder (i.e. the folder containing the board platform folder)
  return '{runtime.hardware.path}';
}

function getRuntimeIdePath(): string {
  // TODO
  // {runtime.ide.path}: the absolute path of the Arduino IDE or Arduino CLI folder
  return '{runtime.ide.path}';
}

function getRuntimeOs(): string {
  // TODO: This is assuming gen-host is also compile-host
  // {runtime.os}: the running OS ("linux", "windows", "macosx")
  switch (osplatform().toLocaleLowerCase()) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macosx';
    case 'linux':
      return 'linux';
    default:
      throw new Error('Unsupported platform: ' + osplatform());
  }
}

function getSourcePath(): string {
  // TODO:
  // {build.source.path}: Path to the sketch being compiled.
  // If the sketch is in an unsaved state, it will the path of its temporary folder.
  return '{build.source.path}';
}

function getLibDiscoveryPhase(): string {
  // TODO
  // {build.library_discovery_phase}:
  // set to 1 during library discovery and to 0 during normal build.
  // A macro defined with this property can be used to disable the inclusion of
  // heavyweight headers during discovery to reduce compilation time.
  // This property was added in Arduino IDE 1.8.14/Arduino Builder 1.6.0/Arduino CLI 0.12.0.
  // Note: with the same intent, -DARDUINO_LIB_DISCOVERY_PHASE was added to
  // recipe.preproc.macros during library discovery in Arduino Builder 1.5.3/Arduino CLI 0.10.0.
  // That flag was replaced by the more flexible {build.library_discovery_phase} property.
  return '0';
}

function getOptFlags(): string {
  // TODO:
  // {compiler.optimization_flags}: see "Sketch debugging configuration" for details
  return '-O2';
}

function getTimeUtc(tzAdjust?: boolean, dstAdjust?: boolean): () => string {
  return () => {
    // TODO:
    // Unix time (seconds since 1970-01-01T00:00:00Z) according to the machine the build
    // is running on
    let unixTime = Math.floor(Date.now() / 1000);
    if (tzAdjust || dstAdjust) {
      // TODO: use tzAdjust and dstAdjust
      unixTime += 3600;
    }
    return `${unixTime}`;
  };
}

function emitPlatform(
  initial: Definition[],
  boardDefined: Definition[],
  platDefs: Definition[],
  rules: GnuMakeRecipe[],
): void {
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

function makeInitialDefs(platformPath: string) {
  const isWin = MakeIfeq('$(OS)', 'Windows_NT');
  const notWin = MakeIfneq('$(OS)', 'Windows_NT');
  const isMac = MakeIfeq('$(uname)', 'Darwin');
  // const notMac = makeIfneq('$(uname)', 'Darwin');
  const initial = [
    MakeDeclDef('RUNTIME_OS', 'windows', [], [isWin]),
    MakeDeclDef('uname', '$(shell uname -s)', [], [notWin]),
    MakeDeclDef('RUNTIME_OS', 'macosx', ['uname'], [notWin, isMac]),
    MakeUnDecl('RUNTIME_OS', 'linux'),
    MakeDeclDef(
      'RUNTIME_PLATFORM_PATH',
      path.dirname(platformPath).replaceAll('\\', '/'),
    ),
    MakeDeclDef('RUNTIME_IDE_VERSION', '10819'),
    MakeDeclDef('IDE_VERSION', '10819'),
  ];
  return initial;
}

async function emit(
  platformPath: string,
  platform: Platform,
  boards: BoardsList,
  libraries: Library[],
): Promise<void> {
  const boardDefined = GenBoardDefs(boards);
  const initial = makeInitialDefs(platformPath);
  // TODO: Don't have recipes & tools fully handled in the platform yet
  const { defs: platDefs, rules } = await BuildPlatform(
    initial,
    boardDefined,
    platform,
    path.dirname(platformPath),
    libraries,
  );

  emitPlatform(initial, boardDefined, platDefs, rules);
}

function expandName(nm: string): { name: string; expansion: string } {
  const name = MakifyName(nm);
  const expansion = '${' + name + '}';
  return { name, expansion };
}

export function GetGnuMakeTarget(): BuildSystemHost {
  return {
    emit,
    expandName,
    globals: {
      getRuntimePlatformPath,
      getRuntimeHardwarePath,
      getRuntimeIdePath,
      getRuntimeOs,
      getSourcePath,
      getVendorName: () => 'VENDOR',
      getBoardId: () => 'BOARD_ID',
      getFQBN: () => 'fqbn',
      getLibDiscoveryPhase,
      getOptFlags,
      getTimeUtc,
    },
  };
}
