#!/usr/bin/env bun
// Call main with boards.txt platform.txt programmers.txt

import { main } from './main.js';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: ');
  console.error(
    `${process.argv[1]} <platform dir> <libs to include in the make file>...`,
  );
} else {
  main(...args)
    .then(() => {})
    .catch((a) => console.log(`# error: ${a}`));
}
