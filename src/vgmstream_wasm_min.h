#ifndef _VGMSTREAM_WASM_MIN_H_
#define _VGMSTREAM_WASM_MIN_H_

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

typedef enum {
    VGMSTREAM_WEB_OUTPUT_WAV = 1,
} vgmstream_web_output_t;

typedef struct {
    bool ignore_loop;
    bool want_info_json;
    int output_format;
} vgmstream_web_options_t;

typedef struct {
    int ok;
    int error_code;
    const char* error_message;
    uint8_t* audio_data;
    size_t audio_size;
    char* info_json;
} vgmstream_web_result_t;

int vgmstream_web_convert(
        const uint8_t* input_data,
        size_t input_size,
        const char* input_name,
        const vgmstream_web_options_t* options,
        vgmstream_web_result_t* result);

void vgmstream_web_free_result(vgmstream_web_result_t* result);

#endif
