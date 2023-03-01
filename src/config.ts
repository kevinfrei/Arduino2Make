import { SafelyUnpickle, Type } from '@freik/core-utils';
import { promises as fs } from 'fs';
import { dump } from './main';

// Var def to match, substr to find, string to replace substr with
type TransformItem = { defmatch: string; text: string; replace: string };
// Var def to match, substring to filter out
type FilterItem = { defmatch: string; remove: string };

// This should grow with time, I think
type Config = {
  transforms: TransformItem[];
  filters: FilterItem[];
};

const isTransformItem = Type.isSpecificTypeFn<TransformItem>(
  [
    ['defmatch', Type.isString],
    ['text', Type.isString],
    ['replace', Type.isString],
  ],
  ['defmatch', 'text', 'replace'],
);
const isFilterItem = Type.isSpecificTypeFn<FilterItem>(
  [
    ['defmatch', Type.isString],
    ['remove', Type.isString],
  ],
  ['defmatch', 'remove'],
);
function isConfig(i: unknown): i is Partial<Config> {
  return (
    Type.hasType(i, 'transforms', Type.isArrayOfFn(isTransformItem)) ||
    Type.hasType(i, 'filters', Type.isArrayOfFn(isFilterItem))
  );
}

let config: Partial<Config> | undefined;

export function configPresent(): boolean {
  return !Type.isUndefined(config);
}

export async function readConfig(
  configs: string[],
): Promise<Partial<Config> | undefined> {
  if (configs.length === 1) {
    try {
      const cfg = await fs.readFile(configs[0].substring(9), 'utf-8');
      const json = SafelyUnpickle(cfg, isConfig);
      if (Type.isUndefined(json)) {
        dump('err')('Invalid type for config file:');
        dump('err')(json);
      }
      return json;
    } catch (e) {
      dump('err')('Unable to read config file:');
      dump('err')(e);
    }
  }
}

export function Transform(
  name: string,
  value: string,
): { name: string; value: string } {
  if (!config || !Type.hasType(config, 'transforms', Type.isArray)) {
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
  if (!config || !Type.hasType(config, 'filters', Type.isArray)) {
    return files;
  }
  for (const { defmatch, remove } of config.filters) {
    if (name === defmatch) {
      files = files.filter((val) => val.indexOf(remove) < 0);
    }
  }
  return files;
}
