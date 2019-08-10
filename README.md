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

I've got a simple parser together, which gives me a hierarchical list of
variables with their corresponding 'namespace', along with a flat list of
'fully qualified' names. I also have value resolution working, which returns a
resolved string, plus a set of any unresolved names still needed.

Next steps appear to be special handling of the 'boards.txt' file, as the
symbols in there are "pick from this, trim off the board name, and use the rest
for name resolution".