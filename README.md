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

The basics work, but I haven't actually tried it yet. I don't have all
'recipes' functional, but compiling looks right. I still need to get the
linking recipe working, then elf to hex and finally flashing.

I don't intend to deal with the bootloader stuff. That happens rarely enough it
doesn't seem worth the effort. Just use the Arduino IDE...

## TODO:

* Make if's indent properly.
* Handle rules beyond just compilation/assembling.
* Try the stuff out (probably with FreiKeys)
* There's the cmd.{os} default value override mechanism that I should take into
account for value resolution, particularly as I'm one of those weird people
that switch between Windows, macOS, and Linux on a semi-regular basis...
* And, finally, eventually, make some tests, probably. Jest seems reasonable.
Seriously, I've found it pretty darned useful in a few other projects...