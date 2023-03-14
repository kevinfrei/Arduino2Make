import { MakeSymbol } from './symbols.js';
import { BuildSystemHost, DumbSymTbl, ParsedFile } from './types.js';

/*
These are all the pre-defined symbols, per the specification:
*/

export function MakeGlobals(bst: BuildSystemHost): ParsedFile {
  const scopedTable: DumbSymTbl = new Map();
  MakeSymbol(
    'runtime.platform.path',
    bst.globals.getRuntimePlatformPath,
    scopedTable,
  );
  MakeSymbol(
    'runtime.hardware.path',
    bst.globals.getRuntimeHardwarePath,
    scopedTable,
  );
  MakeSymbol('runtime.ide.path', bst.globals.getRuntimeIdePath, scopedTable);
  // {runtime.ide.version}: the version number of the Arduino IDE as a number (this uses two digits per version number component, and removes the points and leading zeroes, so Arduino IDE 1.8.3 becomes 01.08.03 which becomes runtime.ide.version=10803). When using Arduino development software other than the Arduino IDE, this is set to a meaningless version number.
  MakeSymbol('runtime.ide.version', '10819', scopedTable);
  // {ide_version}: Compatibility alias for {runtime.ide.version}
  MakeSymbol('ide_version', '10819', scopedTable);
  MakeSymbol('runtime.os', bst.globals.getRuntimeOs, scopedTable);
  MakeSymbol('software', 'ARDUINO', scopedTable);
  // {name}: platform vendor name
  MakeSymbol('name', bst.globals.getVendorName, scopedTable);
  // {_id}: board ID of the board being compiled for
  MakeSymbol('_id', bst.globals.getBoardId, scopedTable);
  // {build.fqbn}: the FQBN (fully qualified board name) of the board being compiled for.
  // The FQBN follows the format:
  // VENDOR:ARCHITECTURE:BOARD_ID[:MENU_ID=OPTION_ID[,MENU2_ID=OPTION_ID ...]]
  MakeSymbol('build.fqbn', bst.globals.getFQBN, scopedTable);
  MakeSymbol('build.source.path', bst.globals.getSourcePath, scopedTable);
  MakeSymbol(
    'build.library_discovery_phase',
    bst.globals.getLibDiscoveryPhase,
    scopedTable,
  );
  MakeSymbol(
    'compiler.optimization_flags',
    bst.globals.getOptFlags,
    scopedTable,
  );
  MakeSymbol(
    'extra.time.utc',
    bst.globals.getTimeUtc(false, false),
    scopedTable,
  );
  // {extra.time.local}: Unix time with local timezone and DST offset
  MakeSymbol(
    'extra.time.local',
    bst.globals.getTimeUtc(true, true),
    scopedTable,
  );
  // {extra.time.zone}: local timezone offset without the DST component
  MakeSymbol(
    'extra.time.zone',
    bst.globals.getTimeUtc(true, false),
    scopedTable,
  );
  // {extra.time.dst}: local daylight savings time offset
  MakeSymbol(
    'extra.time.dst',
    bst.globals.getTimeUtc(false, true),
    scopedTable,
  );

  return { scopedTable };
}
