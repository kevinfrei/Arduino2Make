import { PackageSpec, isPackageSpec } from './package';

export async function DownloadText(fileUrl: string): Promise<string> {
  const res = await fetch(fileUrl);
  return await res.text();
}

export async function GetJsonBlob(url: string): Promise<unknown> {
  const blob = await DownloadText(url);
  const json = JSON.parse(blob) as unknown;
  return json;
}

export async function GetPackages(
  url: string,
): Promise<PackageSpec | undefined> {
  const blob = await GetJsonBlob(url);
  if (isPackageSpec(blob)) {
    return blob;
  }
}
