# Arduino2Make

This is a tool to input Arduino platform configuration files and produce a GNU
Makefile that can be include'd by your little project. It's been tested on
projects using:

- Adafruit Feather nRF52832
- Adafruit Feather nRF52840 Express
- Teensy 3.2

Maybe I'll also get it working with the Adafruit SAMD stuff, as I have a PyRuler
(which is mostly an Adafruit Trinket M0). I'm trying to beat into something
useful (and writing something useful in Python seems like not something I wanna
do...).

Usage:

`yarn` (Strip Flow types...)

`./ar2mk.js folder/with/platform/board/txt/files other/folders with/libraries`
`>` `include.mk`

Then from your Makefile:

```
# Some simple details
ifeq ($(OS),Windows_NT)
	ARD=${HOME}/AppData/Local
	SERIAL_PORT=COM9
else ifeq ($(shell uname -s), Darwin)
	ARD=/Applications/Arduino.app/Contents/Java/hardware
	SERIAL_PORT=$(shell ls /dev/cu.usbmodem5*)
else
  $(error No Linux support yet)
endif

# Some Teensy inputs:
IN_SPEED=24
IN_USB=serialhid
IN_OPT=osstd
IN_KEYS=en-us
EXTRA_TIME_LOCAL=0
BOARD_NAME=teensy31
TOOLS_PATH=${ARD}/tools/arm
RUNTIME_HARDWARE_PATH=${ARD}/teensy
CMD_PATH=${ARD}/tools
SERIAL_PORT_LABEL=${SERIAL_PORT}
SERIAL_PORT_PROTOCOL=serial
# These seem common for everything...
PROJ_NAME=filename
BUILD_PATH=output-dir

# My custom flags
COMPILER_CPP_EXTRA_FLAGS=-DDEBUG=2 -DTEENSY

# Libraries to use:
LIB_WIRE=1
LIB_SPI=1

# Include path commands
USER_INCLUDES=-Iinclude

# C++ source files (can also set S and C files this way)
USER_CPP_SRCS=file0.cpp file1.cpp

include teensy.mk
```

I started this because building in the Arduino IDE is slow, for a variety of
reasons that I could go into. Anyway, I write C++ to run on my devices, not
`.ino` files, so I don't need half of what causes the speed problems, and the
other half seems silly.

Currently this thing works acceptably for my keyboard firmware
(https://github.com/kevinfrei/FreiKey). I've got both the generated include
files, as well as the make files for the various keyboards I've made there. Feel
free to check it out.

## Currently:

I don't intend to deal with the bootloader stuff. That happens rarely enough it
doesn't seem worth the effort. Just use the Arduino IDE...

## TODO:

- Get it working on the AdaFruit AVR stuff
  - I've never actually used Arduino-branded hardware :/
- Make the thing also spit out VSCode settings! This would be awesome (and not
particularly difficult, at this point, either)
  - Bonus points: Make it an actual target, so the Makefile will update it!
- And, finally, eventually, make some tests, probably. Jest seems reasonable.
  Seriously, I've found it pretty darned useful in a few other projects...
