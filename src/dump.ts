import { isString, isUndefined } from '@freik/typechk';
import { promises as fsp } from 'fs';

let outputFile: string[] | undefined;
let outputName: string | undefined;

export function SetOutputFile(dest: unknown) {
  if (isString(dest)) {
    outputName = dest;
    outputFile = [];
  }
}

function dumpToFile(message: unknown): void {
  if (outputFile !== undefined && isString(message)) {
    outputFile.push(message);
  }
}

// Eventually, we can dump stuff into different files, right?
export function Dump(which?: string): (message: unknown) => void {
  switch (which) {
    case undefined:
    case 'log':
      return isUndefined(outputFile) ? console.log : dumpToFile;  
    case 'err':
      return console.error;  
    default:
      return (msg) => {
         
        console.error(which, ' is an invalid selector: ', msg);
      };
  }
}

export async function FlushOutput(): Promise<void> {
  if (!isUndefined(outputFile) && isString(outputName))
    await fsp.writeFile(outputName, outputFile.join('\n'), 'utf-8');
}
