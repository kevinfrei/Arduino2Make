#!/usr/bin/env node
// @flow
// @format

// Call main with boards.txt platform.txt programmers.txt

const main = require('./lib/main.js');

main(...process.argv.slice(2))
  .then(a => {})
  .catch(a => console.log(`# error: ${a}`));
