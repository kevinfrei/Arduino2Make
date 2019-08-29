# Arduino2Make

This is a tool to input Arduino platform configuration files and produce a GNU
Makefile that can be include'd by your little project. It's only been tested on
projects using the Adafruit Feather nRF52832 and Adafruit Feather nRF52840
Express. I'll get it working with the Adafruit SAMD stuff, as I have a PyRuler
I'm trying to beat into something useful (and writing something useful in
Python seems like not something I wanna do...). I'll probably also try to get it working for the Teensy 3.2, as I have a couple of those, too.

Usage:

`yarn` (Strip Flow types...)

`./ar2mk.js folder/with/platform/board/txt/files other/folders with/libraries`
`>` `include.mk`

Then from your Makefile:

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

- Move more things out of the `include`ing file into the generated makefile
- Add usage of the .d files. They're produced: may as well try to use them...
- Add a 'clean' target (and maybe an 'allclean' target, too?)
- Get it working on Teensy & the AdaFruit AVR stuff
  - I've never actually used Arduino hardware :D
- Make the thing also spit out VSCode settings! This would be awesome (and not
particularly difficult, at this point, either)
  - Bonus points: Make it an actual target, so the Makefile will update it!
- And, finally, eventually, make some tests, probably. Jest seems reasonable.
  Seriously, I've found it pretty darned useful in a few other projects...
