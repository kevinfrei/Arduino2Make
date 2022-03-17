# Arduino2Make

This is a tool to input Arduino platform configuration files and produce a GNU
Makefile that can be include'd by your little project. It's been tested on
projects using:

- Adafruit Feather nRF52832
- Adafruit Feather nRF52840 Express
- Adafruit ItsyBitsy nRF52840
- Teensy 3.2
- Teensy 4.0

Maybe I'll also get it tested with the Adafruit SAMD stuff, as I have a PyRuler
(which is mostly an Adafruit Trinket M0). I'm trying to beat into something
useful (and writing something useful in Python seems like not something I wanna
do...).

Usage:

`yarn build` (TypeScript transpilation)

`./ar2mk.js folder/with/platform/board/txt/files other/folders with/libraries`
`>` `include.win.mk` (You'll need to create different files for Windows, Linux,
and MacOS)

Then from your Makefile:

```
# Some 'location' details
ifeq ($(OS),Windows_NT)
	ARD=${HOME}/AppData/Local
	SERIAL_PORT=COM9
else ifeq ($(shell uname -s), Darwin)
	ARD=/Applications/Arduino.app/Contents/Java/hardware
	SERIAL_PORT=$(shell ls /dev/cu.usbmodem5*)
else
  $(error Linux support untested, but probably works like Darwin)
endif

# Some Teensy inputs:
# Your MPU will have different inputs required
# When you try to build, the include.*.mk files will tell you the vars you need to define
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

ifeq ($(OS),Windows_NT)
  include teensy.win.mk
else ifeq ($(shell uname -s), Darwin)
  include teensy.mac.mk
else
  include teensy.lin.mk
endif
```

I started this because building in the Arduino IDE is quite slow, for a variety
of reasons that I could go into. Anyway, I write C++ to run on my devices, not
`.ino` files, so I don't need half of what causes the speed problems (#include
file detection), and the other half seems silly.

Currently this thing works acceptably for my building my keyboard firmware
(https://github.com/kevinfrei/FreiKey). I've got both the generated include
files, as well as the make files for the various keyboards I've made there. Feel
free to check it out.

I also used it for a little test project for a pull request test you can see
here: (https://github.com/kevinfrei/ST7789_135_240_test)

## Currently:

It seems to work reliably for my needs. I also added some custom modification
stuff that I should document somewhere. Here's how I use it in my firmware:
(https://github.com/kevinfrei/FreiKey/blob/main/src/adafruit-make-config.json)

It creates a `compile_commands.json` file that you can use to get fully accurate
VS Code auto-complete, which is pretty excellent.

I can build using 24 cores in a few seconds, and then I flash the firmware.
Works like a charm from both my Windows AMD Ryzen 5900X box, i7 MacMini, and my
M1 Pro MacBook Pro.

I don't intend to deal with the bootloader stuff. That happens rarely enough it
doesn't seem worth the effort. Just use the Arduino IDE if you have to deal with
the bootloader.

## TODO:

- Get it working on the AdaFruit AVR stuff
  - I've never actually used Arduino-branded hardware :/
- Make the thing also spit out VSCode settings! This would be awesome (and not
  particularly difficult, at this point, either)
  - Bonus points: Make it an actual target, so the Makefile will update it!
- And, finally, eventually, make some tests, probably. Jest seems reasonable.
  Seriously, I've found it pretty darned useful in a few other projects...
