#ifndef _VGMSTREAM_WASM_MIN_RUNTIME_H_
#define _VGMSTREAM_WASM_MIN_RUNTIME_H_

#include "vgmstream.h"

VGMSTREAM* allocate_vgmstream_wasm_min(int channels, int loop_flag);
bool vgmstream_open_stream_wasm_min(VGMSTREAM* vgmstream, STREAMFILE* sf, off_t start_offset);
void close_vgmstream_wasm_min(VGMSTREAM* vgmstream);

#endif
