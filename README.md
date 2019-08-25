# Arduino2Make

A tool to input Arduino platform configuration files and produce a GNU Makefile
that can be include'd

I started this because building in the Arduino IDE is slow, for a variety of
reasons that I could go into. Anyway, I write C++ to run on my devices, not
`.ino` files, so I don't need half of what causes the speed problems, and the
other half seem silly.

No idea if I'll actually finish this, but right now, it's annoying to have to
manually deal with changes coming for the awesome Adafruit platform into my
custom Makefiles, so I'm working on this to see how much effort automating this
stuff might be...

## Currently:

Compiling is progressing, but not completing because I'm missing a few things.
There are also a couple of explicit things I've had to work around

To see the almost functioning input, checkout my FreiKeys projects 'bt-3piece'
branch, for the 'test-a2m.mak' makefile.

I don't intend to deal with the bootloader stuff. That happens rarely enough it
doesn't seem worth the effort. Just use the Arduino IDE...

## TODO:

* Eliminate the silly workarounds currently necessary for some implicit oddities
* There's the cmd.{os} default value override mechanism that I should take into
  account for value resolution, particularly as I'm one of those weird people
  that switch between Windows, macOS, and Linux on a semi-regular basis...
* Add support for Arduino libraries: Maybe automatic discovery or something
  similar? Currently, you'd just have to do it all yourself which sucks
* Add usage of the .d files. They're produced by default, may as well try to
  use them...
* Clean up the input variable names. They're highly inconsistent.
* And, finally, eventually, make some tests, probably. Jest seems reasonable.
  Seriously, I've found it pretty darned useful in a few other projects...