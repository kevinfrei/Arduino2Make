import { MakeSymbol } from './symbols';
import { ParsedFile, PlatformTarget, SymbolTable } from './types';

/*
These are all the pre-defined symbols, per the specification:
*/

export function MakeGlobals(pt: PlatformTarget): ParsedFile {
  const scopedTable: SymbolTable = new Map();
  MakeSymbol('runtime.platform.path', pt.getRuntimePlatformPath, scopedTable);
  MakeSymbol('runtime.hardware.path', pt.getRuntimeHardwarePath, scopedTable);
  MakeSymbol('runtime.ide.path', pt.getRuntimeIdePath, scopedTable);
  // {runtime.ide.version}: the version number of the Arduino IDE as a number (this uses two digits per version number component, and removes the points and leading zeroes, so Arduino IDE 1.8.3 becomes 01.08.03 which becomes runtime.ide.version=10803). When using Arduino development software other than the Arduino IDE, this is set to a meaningless version number.
  MakeSymbol('runtime.ide.version', '10819', scopedTable);
  // {ide_version}: Compatibility alias for {runtime.ide.version}
  MakeSymbol('ide_version', '10819', scopedTable);
  MakeSymbol('runtime.os', pt.getRuntimeOs, scopedTable);
  MakeSymbol('software', 'ARDUINO', scopedTable);
  // {name}: platform vendor name
  MakeSymbol('name', pt.getVendorName, scopedTable);
  // {_id}: board ID of the board being compiled for
  MakeSymbol('_id', pt.getBoardId, scopedTable);
  // {build.fqbn}: the FQBN (fully qualified board name) of the board being compiled for.
  // The FQBN follows the format:
  // VENDOR:ARCHITECTURE:BOARD_ID[:MENU_ID=OPTION_ID[,MENU2_ID=OPTION_ID ...]]
  MakeSymbol('build.fqbn', pt.getFQBN, scopedTable);
  MakeSymbol('build.source.path', pt.getSourcePath, scopedTable);
  MakeSymbol(
    'build.library_discovery_phase',
    pt.getLibDiscoveryPhase,
    scopedTable,
  );
  MakeSymbol('compiler.optimization_flags', pt.getOptFlags, scopedTable);
  MakeSymbol('extra.time.utc', pt.getTimeUtc(false, false), scopedTable);
  // {extra.time.local}: Unix time with local timezone and DST offset
  MakeSymbol('extra.time.local', pt.getTimeUtc(true, true), scopedTable);
  // {extra.time.zone}: local timezone offset without the DST component
  MakeSymbol('extra.time.zone', pt.getTimeUtc(true, false), scopedTable);
  // {extra.time.dst}: local daylight savings time offset
  MakeSymbol('extra.time.dst', pt.getTimeUtc(false, true), scopedTable);

  return { scopedTable };
}
