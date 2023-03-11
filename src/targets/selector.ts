import { PlatformTarget } from '../types';
import { Emit } from './makefile';

export function GetMakeTarget(): PlatformTarget {
  // There is no other platform target just yet, so it's always just returning GNU Make:
  return { emit: Emit };
}
