import { FileUtil } from '@freik/node-utils';
import { promises } from 'fs';
import main from '../main';

const outputFiles = ['src/__test__/avr.txt', 'src/__test__/teensy.txt'];
const avrOutput = outputFiles[0];
const teensyOutput = outputFiles[1];

async function deleteOutputs() {
  for (const file of outputFiles) {
    try {
      await promises.unlink(file);
    } catch (err) {
      /* */
    }
  }
}

async function fileCompare(file1: string, file2: string): Promise<boolean> {
  const f1 = await FileUtil.textFileToArrayAsync(file1);
  const f2 = await FileUtil.textFileToArrayAsync(file2);
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
  expect('true').toEqual('true');
  expect(
    await main(`--out:${avrOutput}`, 'src/__test__/hardware/arduino/avr'),
  ).toBeFalsy();
  expect(fileCompare(avrOutput, 'src/__test__/baseline.avr')).toBeTruthy();
});

it('Teensy basics', async () => {
  expect('true').toEqual('true');
  expect(
    await main(`--out:${teensyOutput}`, 'src/__test__/hardware/teensy/avr'),
  ).toBeFalsy();
  expect(
    fileCompare(teensyOutput, 'src/__test__/baseline.teensy'),
  ).toBeTruthy();
});
