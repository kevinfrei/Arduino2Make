import {
  SafelyUnpickle,
  chkArrayOf,
  chkObjectOfType,
  hasFieldType,
  isArray,
  isString,
  isUndefined,
} from '@freik/typechk';
import { promises as fs } from 'node:fs';

import { Dump } from './dump.js';
import { ConfigChanges, FilterItem, TransformItem } from './types.js';

const isTransformItem = chkObjectOfType<TransformItem>({
  defmatch: isString,
  text: isString,
  replace: isString,
});

const isFilterItem = chkObjectOfType<FilterItem>({
  defmatch: isString,
  remove: isString,
});

function isConfigChanges(i: unknown): i is Partial<ConfigChanges> {
  return (
    hasFieldType(i, 'transforms', chkArrayOf(isTransformItem)) ||
    hasFieldType(i, 'filters', chkArrayOf(isFilterItem))
  );
}

let config: Partial<ConfigChanges> | undefined;

export async function LoadConfig(cfgPath: string): Promise<void> {
  try {
    const cfg = await fs.readFile(cfgPath, 'utf-8');
    config = SafelyUnpickle(cfg, isConfigChanges);
    if (isUndefined(config)) {
      Dump('err')('Invalid config file:');
      Dump('err')(config);
    }
  } catch (e) {
    Dump('err')('Unable to read config file:');
    Dump('err')(e);
  }
}

export function AddConfig(cfg: Partial<ConfigChanges>): void {
  if (isUndefined(config)) {
    config = cfg;
  } else {
    config = { ...config, ...cfg };
  }
}

export function Transform(
  name: string,
  value: string,
): { name: string; value: string } {
  if (!config || !isArray(config.transforms)) {
    return { name, value };
  }
  for (const { defmatch, text, replace } of config.transforms) {
    // For now just do a simple "indexOf" for matching, I guess
    if (name.indexOf(defmatch) >= 0) {
      value = value.replace(text, replace);
    }
  }
  return { name, value };
}

export function Filter(name: string, files: string[]): string[] {
  if (!config || !isArray(config.filters)) {
    return files;
  }
  for (const { defmatch, remove } of config.filters) {
    if (name === defmatch) {
      files = files.filter((val) => val.indexOf(remove) < 0);
    }
  }
  return files;
}
