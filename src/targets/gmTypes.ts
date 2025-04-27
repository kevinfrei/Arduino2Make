import type { DependentUpon } from '../types';

export type GnuMakeRecipe = DependentUpon & {
  src: string;
  dst: string;
  command: string;
};
