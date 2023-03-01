import { parseVariable } from './parser';
import { ParsedFile, SymbolTable } from './types';

/*
These are all the pre-defined symbols, per the specification:
*/

export function makeGlobals(): ParsedFile {
  const scopedTable: SymbolTable = new Map();
  const pv = (nm: string, val?: string) =>
    parseVariable(nm + '=' + (val || `@@${nm}@@`), scopedTable);
  // {runtime.platform.path}: the absolute path of the board platform folder (i.e. the folder containing boards.txt)
  pv('runtime.platform.path');
  // {runtime.hardware.path}: the absolute path of the hardware folder (i.e. the folder containing the board platform folder)
  pv('runtime.hardware.path');
  // {runtime.ide.path}: the absolute path of the Arduino IDE or Arduino CLI folder
  pv('runtime.ide.path');
  // {runtime.ide.version}: the version number of the Arduino IDE as a number (this uses two digits per version number component, and removes the points and leading zeroes, so Arduino IDE 1.8.3 becomes 01.08.03 which becomes runtime.ide.version=10803). When using Arduino development software other than the Arduino IDE, this is set to a meaningless version number.
  pv('runtime.ide.version', '10819');
  // {ide_version}: Compatibility alias for {runtime.ide.version}
  pv('ide_version', '10819');
  // {runtime.os}: the running OS ("linux", "windows", "macosx")
  pv('runtime.os');
  // {software}: set to "ARDUINO"
  pv('software', 'ARDUINO');
  // {name}: platform vendor name
  pv('name');
  // {_id}: board ID of the board being compiled for
  pv('_id');
  // {build.fqbn}: the FQBN (fully qualified board name) of the board being compiled for. The FQBN follows the format: VENDOR:ARCHITECTURE:BOARD_ID[:MENU_ID=OPTION_ID[,MENU2_ID=OPTION_ID ...]]
  pv('build.fqbn');
  // {build.source.path}: Path to the sketch being compiled. If the sketch is in an unsaved state, it will the path of its temporary folder.
  pv('build.source.path');
  // {build.library_discovery_phase}: set to 1 during library discovery and to 0 during normal build. A macro defined with this property can be used to disable the inclusion of heavyweight headers during discovery to reduce compilation time. This property was added in Arduino IDE 1.8.14/Arduino Builder 1.6.0/Arduino CLI 0.12.0. Note: with the same intent, -DARDUINO_LIB_DISCOVERY_PHASE was added to recipe.preproc.macros during library discovery in Arduino Builder 1.5.3/Arduino CLI 0.10.0. That flag was replaced by the more flexible {build.library_discovery_phase} property.
  pv('build.library_discovery_phase');
  // {compiler.optimization_flags}: see "Sketch debugging configuration" for details
  pv('compiler.optimization_flags');
  // {extra.time.utc}: Unix time (seconds since 1970-01-01T00:00:00Z) according to the machine the build is running on
  pv('extra.time.utc');
  // {extra.time.local}: Unix time with local timezone and DST offset
  pv('extra.time.local');
  // {extra.time.zone}: local timezone offset without the DST component
  pv('extra.time.zone');
  // {extra.time.dst}: local daylight savings time offset
  pv('extra.time.dst');

  return { scopedTable };
}
