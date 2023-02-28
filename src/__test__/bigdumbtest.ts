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

beforeAll(deleteOutputs);
afterAll(deleteOutputs);

it('AVR basics', async () => {
  expect('true').toEqual('true');
  expect(
    await main(`--out:${avrOutput}`, 'src/__test__/hardware/arduino/avr'),
  ).toBeFalsy();
});

it('Teensy basics', async () => {
  expect('true').toEqual('true');
  expect(
    await main(`--out:${teensyOutput}`, 'src/__test__/hardware/teensy/avr'),
  ).toBeFalsy();
});
