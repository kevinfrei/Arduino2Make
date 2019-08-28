# Arduino2Make

This is a tool to input Arduino platform configuration files and produce a GNU
Makefile that can be include'd by your little project.

Usage:

`yarn`

`./ar2mk.js folder/with/platform/board/txt/files other/folders with/libraries`

I started this because building in the Arduino IDE is slow, for a variety of
reasons that I could go into. Anyway, I write C++ to run on my devices, not
`.ino` files, so I don't need half of what causes the speed problems, and the
other half seems silly.

Currently this thing works acceptably (minus final packaging & flashing) for
my keyboard (https://github.com/kevinfrei/FreiKey). I've committed the example
Makefile over there. Feel free to check it out (Mentioned below)

## Currently:

Compiling & linking all work, with libraries! (At least it appears to with the
AdaFruit Feather nRF52840 Express). I need to get the final packaging step
working, then add flashing. I suppose

To see the almost functioning input, checkout my FreiKeys projects 'bt-3piece'
branch, for the 'test-a2m.mak' makefile.

I don't intend to deal with the bootloader stuff. That happens rarely enough it
doesn't seem worth the effort. Just use the Arduino IDE...

## TODO:

- Enable a 'flash' target!
- Add usage of the .d files. They're produced by default, may as well try to
  use them...
- Clean up the input variable names. They're highly inconsistent.
- Make the thing also spit out VSCode settings! This would be awesome (and not
too difficult, either)
- Get it working on Teensy & the AdaFruit AVR stuff
  - I've never actually used Arduino hardware :D
- Make the thing also spit out VSCode settings! This would be awesome (and not
too difficult, either)
- And, finally, eventually, make some tests, probably. Jest seems reasonable.
  Seriously, I've found it pretty darned useful in a few other projects...
