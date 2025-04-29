import type {
  BuildSystemHost,
  DumbSymTbl,
  SimpleSymbol,
  Sym,
  SymbolTable,
} from './types';

let buildSysTarget: BuildSystemHost<DumbSymTbl, SimpleSymbol> | null = null;

let newBuildTarget: BuildSystemHost<SymbolTable, Sym> | null = null;

export function GetTarget(): BuildSystemHost<DumbSymTbl, SimpleSymbol> {
  if (buildSysTarget === null) {
    throw new Error('Build system target not set');
  }
  return buildSysTarget;
}

export function SetTarget(
  target: BuildSystemHost<DumbSymTbl, SimpleSymbol>,
): void {
  buildSysTarget = target;
}

export function GetNewTarget(): BuildSystemHost<SymbolTable, Sym> {
  if (newBuildTarget === null) {
    throw new Error('(New) Build system target not set');
  }
  return newBuildTarget;
}

export function SetNewTarget(target: BuildSystemHost<SymbolTable, Sym>): void {
  newBuildTarget = target;
}
