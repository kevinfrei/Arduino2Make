import { platform } from 'os';
import { MakeSymbol } from './symbols';
import { ParsedFile, SymbolTable } from './types';

/*
These are all the pre-defined symbols, per the specification:
*/

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
  switch (platform().toLocaleLowerCase()) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macosx';
    case 'linux':
      return 'linux';
    default:
      throw new Error('Unsupported platform: ' + platform());
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

function getTimeUtc(tzAdjust?: boolean, dstAdjust?: boolean): string {
  // TODO:
  // Unix time (seconds since 1970-01-01T00:00:00Z) according to the machine the build
  // is running on
  let unixTime = Math.floor(Date.now() / 1000);
  if (tzAdjust || dstAdjust) {
    // TODO: use tzAdjust and dstAdjust
    unixTime += 3600;
  }
  return `${unixTime}`;
}

export function MakeGlobals(): ParsedFile {
  const scopedTable: SymbolTable = new Map();
  MakeSymbol('runtime.platform.path', getRuntimePlatformPath, scopedTable);
  MakeSymbol('runtime.hardware.path', getRuntimeHardwarePath, scopedTable);
  MakeSymbol('runtime.ide.path', getRuntimeIdePath, scopedTable);
  // {runtime.ide.version}: the version number of the Arduino IDE as a number (this uses two digits per version number component, and removes the points and leading zeroes, so Arduino IDE 1.8.3 becomes 01.08.03 which becomes runtime.ide.version=10803). When using Arduino development software other than the Arduino IDE, this is set to a meaningless version number.
  MakeSymbol('runtime.ide.version', '10819', scopedTable);
  // {ide_version}: Compatibility alias for {runtime.ide.version}
  MakeSymbol('ide_version', '10819', scopedTable);
  MakeSymbol('runtime.os', getRuntimeOs, scopedTable);
  MakeSymbol('software', 'ARDUINO', scopedTable);
  // {name}: platform vendor name
  MakeSymbol('name', 'vendor name', scopedTable);
  // {_id}: board ID of the board being compiled for
  MakeSymbol('_id', 'board id', scopedTable);
  // {build.fqbn}: the FQBN (fully qualified board name) of the board being compiled for.
  // The FQBN follows the format:
  // VENDOR:ARCHITECTURE:BOARD_ID[:MENU_ID=OPTION_ID[,MENU2_ID=OPTION_ID ...]]
  MakeSymbol('build.fqbn', 'FQBN', scopedTable);
  MakeSymbol('build.source.path', getSourcePath, scopedTable);
  MakeSymbol(
    'build.library_discovery_phase',
    getLibDiscoveryPhase,
    scopedTable,
  );
  MakeSymbol('compiler.optimization_flags', getOptFlags, scopedTable);
  MakeSymbol('extra.time.utc', getTimeUtc, scopedTable);
  // {extra.time.local}: Unix time with local timezone and DST offset
  MakeSymbol('extra.time.local', () => getTimeUtc(true, true), scopedTable);
  // {extra.time.zone}: local timezone offset without the DST component
  MakeSymbol('extra.time.zone', () => getTimeUtc(true, false), scopedTable);
  // {extra.time.dst}: local daylight savings time offset
  MakeSymbol('extra.time.dst', () => getTimeUtc(false, true), scopedTable);

  return { scopedTable };
}
