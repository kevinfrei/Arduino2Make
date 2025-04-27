import type { BuildSystemHost } from './types';

let buildSysTarget: BuildSystemHost | null = null;

export function GetTarget(): BuildSystemHost {
  if (buildSysTarget === null) {
    throw new Error('Build system target not set');
  }
  return buildSysTarget;
}

export function SetTarget(target: BuildSystemHost): void {
  buildSysTarget = target;
}
