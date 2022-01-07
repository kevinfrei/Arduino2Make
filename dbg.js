#!/usr/bin/env node
// Call main with boards.txt platform.txt programmers.txt

import main from './lib/main.js';
main(...process.argv.slice(2))
  .then((a) => console.log('# end'))
  .catch((a) => console.log(`# error: ${a}`));
