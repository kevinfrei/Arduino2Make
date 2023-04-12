import {
  chkArrayOf,
  chkFieldType,
  chkObjectOf,
  chkObjectOfType,
  chkStrField,
  isString,
} from '@freik/typechk';

export type PlatformPair = { packager: string; name: string };
const isPackagePair = chkObjectOfType({
  packager: isString,
  name: isString,
});

export type ToolTriplet = PlatformPair & { version: string };
const isToolTriplet = chkObjectOfType({
  packager: isString,
  name: isString,
  version: isString,
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

const isPlatformEntry = chkObjectOfType<PlatformEntry>({
  name: isString,
  architecture: isString,
  version: isString,
  category: isString,
  help: chkObjectOf(chkStrField('online')),
  url: isString,
  archiveFileName: isString,
  checksum: isString,
  size: isString,
  boards: chkArrayOf(chkStrField('name')),
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

const isToolSystemEntry = chkObjectOfType<ToolSystemEntry>({
  size: isString,
  checksum: isString,
  host: isString,
  archiveFileName: isString,
  url: isString,
});

export type ToolEntry = {
  name: string;
  version: string;
  systems: ToolSystemEntry[];
};

const isToolEntry = chkObjectOfType<ToolEntry>({
  name: isString,
  version: isString,
  systems: chkArrayOf(isToolSystemEntry),
});

export type PackageEntry = {
  name: string;
  maintainer: string;
  websiteURL: string;
  email: string;
  platforms: PlatformEntry[];
  tools: ToolEntry[];
};

const isPackageEntry = chkObjectOfType<PackageEntry>({
  name: isString,
  maintainer: isString,
  websiteURL: isString,
  email: isString,
  platforms: isPlatformEntry,
  tools: isToolEntry,
});

export type PackageSpec = { packages: PackageEntry[] };

export const isPackageSpec = chkFieldType(
  'packages',
  chkArrayOf(isPackageEntry),
);
