###############################
# CLI tools
###############################

LIBAO_IPATH = ../../libao/include
LIBAO_LPATH = ../../libao/bin

###############################################################################
### main defs

CFLAGS += $(DEF_CFLAGS) -DVAR_ARRAYS $(EXTRA_CFLAGS)
LDFLAGS += -L../src -lvgmstream -lm $(EXTRA_LDFLAGS)
TARGET_EXT_LIBS = 

OUTPUT_CLI = vgmstream-cli
OUTPUT_API = api_example

ifeq ($(TARGET_OS),Windows_NT)
  CFLAGS += -DWIN32 -I../ext_includes -I../ext_libs/Getopt
  LDFLAGS += -L../ext_libs/$(DLL_DIR)

  # strip needs full name
  OUTPUT_CLI = vgmstream-cli.exe
  OUTPUT_API = api_example.exe

else
  #todo move to subfolders and remove
  CFLAGS += -I../ext_includes

  LIBAO_LIB = -lao
endif

CFLAGS += $(LIBS_CFLAGS)
LDFLAGS += $(LIBS_LDFLAGS)
TARGET_EXT_LIBS += $(LIBS_TARGET_EXT_LIBS)

CLI_SRCS = vgmstream_cli.c vgmstream_cli_utils.c wav_utils.c

export CFLAGS LDFLAGS


###############################################################################
### targets

vgmstream_cli: libvgmstream.a $(TARGET_EXT_LIBS)
	$(CC) $(CFLAGS) $(CLI_SRCS) $(LDFLAGS) -o $(OUTPUT_CLI)
	$(STRIP) $(OUTPUT_CLI)

api_example: libvgmstream.a $(TARGET_EXT_LIBS)
	$(CC) $(CFLAGS) api_example.c $(LDFLAGS) -o $(OUTPUT_API)
	$(STRIP) $(OUTPUT_API)

libvgmstream.a:
	$(MAKE) -C ../src $@

$(TARGET_EXT_LIBS):
	$(MAKE) -C ../ext_libs $@

clean:
	$(RMF) $(OUTPUT_CLI) $(OUTPUT_API)

.PHONY: clean vgmstream_cli libvgmstream.a $(TARGET_EXT_LIBS)
