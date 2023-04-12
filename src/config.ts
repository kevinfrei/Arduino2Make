import {
  SafelyUnpickle,
  chkArrayOf,
  chkObjectOfType,
  hasFieldType,
  isArray,
  isString,
  isUndefined,
} from '@freik/typechk';
import { promises as fs } from 'fs';
import { Dump } from './dump.js';

// Var def to match, substr to find, string to replace substr with
type TransformItem = { defmatch: string; text: string; replace: string };
// Var def to match, substring to filter out
type FilterItem = { defmatch: string; remove: string };

// This should grow with time, I think
type Config = {
  transforms: TransformItem[];
  filters: FilterItem[];
};

const isTransformItem = chkObjectOfType<TransformItem>({
  defmatch: isString,
  text: isString,
  replace: isString,
});

const isFilterItem = chkObjectOfType<FilterItem>({
  defmatch: isString,
  remove: isString,
});

function isConfig(i: unknown): i is Partial<Config> {
  return (
    hasFieldType(i, 'transforms', chkArrayOf(isTransformItem)) ||
    hasFieldType(i, 'filters', chkArrayOf(isFilterItem))
  );
}

let config: Partial<Config> | undefined;

export function IsConfigPresent(): boolean {
  return !isUndefined(config);
}

export async function ReadConfig(
  cfgPath: string,
): Promise<Partial<Config> | undefined> {
  try {
    const cfg = await fs.readFile(cfgPath, 'utf-8');
    const json = SafelyUnpickle(cfg, isConfig);
    if (isUndefined(json)) {
      Dump('err')('Invalid type for config file:');
      Dump('err')(json);
    }
    return json;
  } catch (e) {
    Dump('err')('Unable to read config file:');
    Dump('err')(e);
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
