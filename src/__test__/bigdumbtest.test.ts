import { TextFileToArray } from '@freik/files';
import { afterAll, beforeAll, expect, it } from 'bun:test';
import { promises } from 'node:fs';

import { main } from '../main';

const outputFiles = [
  'src/__test__/avr.txt',
  'src/__test__/teensy.txt',
  'src/__test__/teensy-libs.txt',
];
const [avrOutput, teensyOutput, teensyLibsOutput] = outputFiles;

async function deleteOutputs() {
  for (const file of outputFiles) {
    try {
      await promises.unlink(file);
    } catch {
      /* */
    }
  }
}

async function fileCompare(file1: string, file2: string): Promise<boolean> {
  const f1 = await TextFileToArray(file1);
  const f2 = await TextFileToArray(file2);
  if (f1.length !== f2.length) {
    return false;
  }
  for (let i = 0; i < f1.length; i++) {
    if (f1[i] !== f2[i]) {
      return false;
    }
  }
  return true;
}

beforeAll(deleteOutputs);
afterAll(deleteOutputs);

it('AVR basics', async () => {
  let failed = true;
  try {
    expect(
      await main('--out', avrOutput, 'src/__test__/hardware/arduino/avr'),
    ).toBeFalsy();
    expect(
      await fileCompare(avrOutput, 'src/__test__/baseline.avr'),
    ).toBeTruthy();
    failed = false;
  } finally {
    if (failed) {
      await promises.copyFile(avrOutput, avrOutput + '.err');
    }
  }
});

it('Teensy basics', async () => {
  let failed = true;
  try {
    expect(
      await main('--out', teensyOutput, 'src/__test__/hardware/teensy/avr'),
    ).toBeFalsy();
    expect(
      await fileCompare(teensyOutput, 'src/__test__/baseline.teensy'),
    ).toBeTruthy();
    failed = false;
  } finally {
    if (failed) {
      await promises.copyFile(teensyOutput, teensyOutput + '.err');
    }
  }
});

it('Teensy with some libs', async () => {
  let failed = true;
  try {
    expect(
      await main(
        '--out',
        teensyLibsOutput,
        'src/__test__/hardware/teensy/avr',
        'src/__test__/libraries',
      ),
    ).toBeFalsy();
    expect(
      await fileCompare(teensyLibsOutput, 'src/__test__/baseline.libs'),
    ).toBeTruthy();
    failed = false;
  } finally {
    if (failed) {
      await promises.copyFile(teensyLibsOutput, teensyLibsOutput + '.err');
    }
  }
});
