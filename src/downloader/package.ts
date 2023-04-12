import { Type } from '@freik/core-utils';

export type PlatformPair = { packager: string; name: string };
const isPackagePair = Type.isObjectOfFullTypeFn({
  packager: Type.isString,
  name: Type.isString,
});

export type ToolTriplet = PlatformPair & { version: string };
const isToolTriplet = Type.isObjectOfFullTypeFn({
  packager: Type.isString,
  name: Type.isString,
  version: Type.isString,
});

export type PlatformEntry = {
  name: string;
  architecture: string;
  version: string;
  category: string;
  help: { online: string };
  url: string;
  archiveFileName: string;
  checksum: string;
  size: string;
  boards: { name: string }[];
  toolDependencies: ToolTriplet[];
  discoveryDependencies: PlatformPair[];
  monitorDependencies: PlatformPair[];
};

const isPlatformEntry = Type.isObjectOfFullTypeFn<PlatformEntry>({
  name: Type.isString,
  architecture: Type.isString,
  version: Type.isString,
  category: Type.isString,
  help: Type.isObjectOfFn(Type.hasStrFn('online')),
  url: Type.isString,
  archiveFileName: Type.isString,
  checksum: Type.isString,
  size: Type.isString,
  boards: Type.isArrayOfFn(Type.hasStrFn('name')),
  toolDependencies: isToolTriplet,
  discoveryDependencies: isPackagePair,
  monitorDependencies: isPackagePair,
});

export type ToolSystemEntry = {
  size: string; // This might need to be a string -> bigint thing...
  checksum: string;
  host: string; // Maybe an enum? Not sure: could be a big enum...
  archiveFileName: string;
  url: string;
};

const isToolSystemEntry = Type.isObjectOfFullTypeFn<ToolSystemEntry>({
  size: Type.isString,
  checksum: Type.isString,
  host: Type.isString,
  archiveFileName: Type.isString,
  url: Type.isString,
});

export type ToolEntry = {
  name: string;
  version: string;
  systems: ToolSystemEntry[];
};

const isToolEntry = Type.isObjectOfFullTypeFn<ToolEntry>({
  name: Type.isString,
  version: Type.isString,
  systems: Type.isArrayOfFn(isToolSystemEntry),
});

export type PackageEntry = {
  name: string;
  maintainer: string;
  websiteURL: string;
  email: string;
  platforms: PlatformEntry[];
  tools: ToolEntry[];
};

const isPackageEntry = Type.isObjectOfFullTypeFn<PackageEntry>({
  name: Type.isString,
  maintainer: Type.isString,
  websiteURL: Type.isString,
  email: Type.isString,
  platforms: isPlatformEntry,
  tools: isToolEntry,
});

export type PackageSpec = { packages: PackageEntry[] };

export const isPackageSpec = Type.hasTypeFn(
  'packages',
  Type.isArrayOfFn(isPackageEntry),
);
