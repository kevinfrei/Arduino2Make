import { FileUtil } from '@freik/node-utils';
import { promises } from 'fs';
import main from '../main';

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
  expect(
    await main(`--out:${avrOutput}`, 'src/__test__/hardware/arduino/avr'),
  ).toBeFalsy();
  expect(
    await fileCompare(avrOutput, 'src/__test__/baseline.avr'),
  ).toBeTruthy();
});

it('Teensy basics', async () => {
  expect(
    await main(`--out:${teensyOutput}`, 'src/__test__/hardware/teensy/avr'),
  ).toBeFalsy();
  expect(
    await fileCompare(teensyOutput, 'src/__test__/baseline.teensy'),
  ).toBeTruthy();
});

it('Teensy with some libs', async () => {
  expect(
    await main(
      `--out:${teensyLibsOutput}`,
      'src/__test__/hardware/teensy/avr',
      'src/__test__/libraries/Adafruit_Circuit_Playground',
      'src/__test__/libraries/Bridge',
      'src/__test__/libraries/Esplora',
      'src/__test__/libraries/Ethernet',
      'src/__test__/libraries/Firmata',
      'src/__test__/libraries/GSM',
      'src/__test__/libraries/Keyboard',
      'src/__test__/libraries/LiquidCrystal',
      'src/__test__/libraries/Mouse',
      'src/__test__/libraries/RobotIRremote',
      'src/__test__/libraries/Robot_Control',
      'src/__test__/libraries/Robot_Motor',
      'src/__test__/libraries/SD',
      'src/__test__/libraries/Servo',
      'src/__test__/libraries/SpacebrewYun',
      'src/__test__/libraries/Stepper',
      'src/__test__/libraries/Temboo',
      'src/__test__/libraries/TFT',
      'src/__test__/libraries/WiFi',
    ),
  ).toBeFalsy();
  expect(
    await fileCompare(teensyLibsOutput, 'src/__test__/baseline.libs'),
  ).toBeTruthy();
});
