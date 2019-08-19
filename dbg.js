#!/usr/bin/env node
// @flow
// @format

// Call main with boards.txt platform.txt programmers.txt

const main = require('./src/main.js');

main(process.argv[2], process.argv[3], process.argv[4]).then(a => {});
