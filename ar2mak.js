#!/usr/bin/env node
// @format

// Call main with boards.txt platform.txt programmers.txt

import * as main from './lib/main.js';

main(...process.argv.slice(2))
  .then((a) => {})
  .catch((a) => console.log(`# error: ${a}`));
