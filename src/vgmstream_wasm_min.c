#include "vgmstream_wasm_min.h"

#include "../cli/wav_utils.h"
#include "../cli/vjson.h"
#include "../version.h"
#include "libvgmstream.h"

#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#ifndef VGMSTREAM_VERSION
#define VGMSTREAM_VERSION "unknown version " __DATE__
#endif

typedef struct {
    const uint8_t* data;
    size_t size;
    char* name;
} wasm_min_streamfile_priv_t;

static char* wasm_min_strdup(const char* str) {
    size_t len = strlen(str) + 1;
    char* copy = malloc(len);
    if (!copy)
        return NULL;
    memcpy(copy, str, len);
    return copy;
}

static void wasm_min_reset_result(vgmstream_web_result_t* result) {
    memset(result, 0, sizeof(*result));
}

static int wasm_min_set_error(vgmstream_web_result_t* result, int error_code, const char* message) {
    if (result) {
        result->ok = 0;
        result->error_code = error_code;
        result->error_message = message;
    }
    return error_code;
}

static int wasm_min_streamfile_read(void* user_data, uint8_t* dst, int64_t offset, int length) {
    wasm_min_streamfile_priv_t* priv = user_data;
    if (!priv || !dst || !priv->data || length <= 0 || offset < 0)
        return 0;
    if ((size_t)offset >= priv->size)
        return 0;

    size_t bytes_left = priv->size - (size_t)offset;
    size_t bytes_to_copy = (size_t)length;
    if (bytes_to_copy > bytes_left)
        bytes_to_copy = bytes_left;

    memcpy(dst, priv->data + offset, bytes_to_copy);
    return (int)bytes_to_copy;
}

static int64_t wasm_min_streamfile_get_size(void* user_data) {
    wasm_min_streamfile_priv_t* priv = user_data;
    return priv ? (int64_t)priv->size : 0;
}

static const char* wasm_min_streamfile_get_name(void* user_data) {
    wasm_min_streamfile_priv_t* priv = user_data;
    return priv ? priv->name : NULL;
}

static void wasm_min_streamfile_close(libstreamfile_t* libsf) {
    if (!libsf)
        return;

    wasm_min_streamfile_priv_t* priv = libsf->user_data;
    if (priv) {
        free(priv->name);
        free(priv);
    }
    free(libsf);
}

static libstreamfile_t* wasm_min_streamfile_open_internal(const uint8_t* data, size_t size, const char* name);

static libstreamfile_t* wasm_min_streamfile_open(void* user_data, const char* filename) {
    wasm_min_streamfile_priv_t* priv = user_data;
    if (!priv || !filename || !priv->name)
        return NULL;
    if (strcmp(filename, priv->name) != 0)
        return NULL;
    return wasm_min_streamfile_open_internal(priv->data, priv->size, priv->name);
}

static libstreamfile_t* wasm_min_streamfile_open_internal(const uint8_t* data, size_t size, const char* name) {
    wasm_min_streamfile_priv_t* priv = NULL;
    libstreamfile_t* libsf = NULL;

    libsf = calloc(1, sizeof(*libsf));
    if (!libsf)
        goto fail;

    priv = calloc(1, sizeof(*priv));
    if (!priv)
        goto fail;

    priv->data = data;
    priv->size = size;
    priv->name = wasm_min_strdup(name);
    if (!priv->name)
        goto fail;

    libsf->user_data = priv;
    libsf->read = wasm_min_streamfile_read;
    libsf->get_size = wasm_min_streamfile_get_size;
    libsf->get_name = wasm_min_streamfile_get_name;
    libsf->open = wasm_min_streamfile_open;
    libsf->close = wasm_min_streamfile_close;

    return libsf;
fail:
    if (libsf)
        wasm_min_streamfile_close(libsf);
    return NULL;
}

static char* wasm_min_build_info_json(libvgmstream_t* lib) {
    char* buf = calloc(1, 0x1000);
    if (!buf)
        return NULL;

    vjson_t j = {0};
    vjson_init(&j, buf, 0x1000);

    vjson_obj_open(&j);
        vjson_keystr(&j, "version", VGMSTREAM_VERSION);
        vjson_keyint(&j, "sampleRate", lib->format->sample_rate);
        vjson_keyint(&j, "channels", lib->format->channels);

        vjson_key(&j, "mixingInfo");
        if (lib->format->input_channels > 0) {
            vjson_obj_open(&j);
                vjson_keyint(&j, "inputChannels", lib->format->input_channels);
                vjson_keyint(&j, "outputChannels", lib->format->channels);
            vjson_obj_close(&j);
        }
        else {
            vjson_null(&j);
        }

        vjson_keyintnull(&j, "channelLayout", lib->format->channel_layout);

        vjson_key(&j, "loopingInfo");
        if (lib->format->loop_end > lib->format->loop_start) {
            vjson_obj_open(&j);
                vjson_keyint(&j, "start", lib->format->loop_start);
                vjson_keyint(&j, "end", lib->format->loop_end);
            vjson_obj_close(&j);
        }
        else {
            vjson_null(&j);
        }

        vjson_keyint(&j, "numberOfSamples", lib->format->stream_samples);
        vjson_keystr(&j, "encoding", lib->format->codec_name);
        vjson_keystr(&j, "layout", lib->format->layout_name);
        vjson_keystr(&j, "metadataSource", lib->format->meta_name);
        vjson_keyint(&j, "bitrate", lib->format->stream_bitrate);

        vjson_key(&j, "streamInfo");
        vjson_obj_open(&j);
            vjson_keyint(&j, "index", lib->format->subsong_index);
            vjson_keystr(&j, "name", lib->format->stream_name);
            vjson_keyint(&j, "total", lib->format->subsong_count);
        vjson_obj_close(&j);

        vjson_keyint(&j, "playSamples", lib->format->play_samples);
    vjson_obj_close(&j);

    return buf;
}

int vgmstream_web_convert(
        const uint8_t* input_data,
        size_t input_size,
        const char* input_name,
        const vgmstream_web_options_t* options,
        vgmstream_web_result_t* result) {
    if (!result)
        return -1;

    wasm_min_reset_result(result);

    if (!input_data || input_size == 0 || !input_name || input_name[0] == '\0')
        return wasm_min_set_error(result, -1, "invalid input");

    if (options && options->output_format && options->output_format != VGMSTREAM_WEB_OUTPUT_WAV)
        return wasm_min_set_error(result, -2, "only WAV output is supported");

    libstreamfile_t* libsf = NULL;
    libvgmstream_t* lib = NULL;
    uint8_t* pcm_data = NULL;
    uint8_t* wav_data = NULL;
    void* decode_buf = NULL;
    char* info_json = NULL;
    size_t pcm_capacity = 0;
    size_t pcm_size = 0;
    int64_t total_samples = 0;
    int err = -1;

    libsf = wasm_min_streamfile_open_internal(input_data, input_size, input_name);
    if (!libsf)
        return wasm_min_set_error(result, -3, "failed to create in-memory streamfile");

    lib = libvgmstream_init();
    if (!lib) {
        err = wasm_min_set_error(result, -4, "failed to initialize libvgmstream");
        goto fail;
    }

    libvgmstream_config_t cfg = {0};
    cfg.disable_config_override = true;
    cfg.ignore_loop = options ? options->ignore_loop : false;
    cfg.force_sfmt = LIBVGMSTREAM_SFMT_PCM16;
    libvgmstream_setup(lib, &cfg);

    err = libvgmstream_open_stream(lib, libsf, 0);
    libstreamfile_close(libsf);
    libsf = NULL;
    if (err < 0) {
        err = wasm_min_set_error(result, -5, "input is not a supported Wwise stream");
        goto fail;
    }

    int sample_size = lib->format->sample_size;
    int channels = lib->format->channels;
    int decode_samples = 4096;
    size_t decode_bytes = (size_t)decode_samples * sample_size * channels;
    decode_buf = malloc(decode_bytes);
    if (!decode_buf) {
        err = wasm_min_set_error(result, -6, "failed to allocate decode buffer");
        goto fail;
    }

    while (!lib->decoder->done) {
        err = libvgmstream_fill(lib, decode_buf, decode_samples);
        if (err < 0) {
            err = wasm_min_set_error(result, -7, "decode failed");
            goto fail;
        }

        int buf_samples = lib->decoder->buf_samples;
        int buf_bytes = lib->decoder->buf_bytes;
        if (buf_samples <= 0 || buf_bytes <= 0)
            continue;

        size_t needed = pcm_size + (size_t)buf_bytes;
        if (needed > pcm_capacity) {
            size_t new_capacity = pcm_capacity ? pcm_capacity * 2 : decode_bytes * 2;
            while (new_capacity < needed) {
                new_capacity *= 2;
            }

            uint8_t* new_pcm = realloc(pcm_data, new_capacity);
            if (!new_pcm) {
                err = wasm_min_set_error(result, -8, "failed to grow PCM buffer");
                goto fail;
            }
            pcm_data = new_pcm;
            pcm_capacity = new_capacity;
        }

        wav_swap_samples_le(lib->decoder->buf, channels * buf_samples, sample_size);
        memcpy(pcm_data + pcm_size, lib->decoder->buf, buf_bytes);
        pcm_size += (size_t)buf_bytes;
        total_samples += buf_samples;
    }

    wav_header_t wav = {
        .sample_count = (int32_t)total_samples,
        .sample_rate = lib->format->sample_rate,
        .channels = channels,
        .sample_size = sample_size,
        .is_float = lib->format->sample_format == LIBVGMSTREAM_SFMT_FLOAT,
    };
    uint8_t wav_header[0x100];
    size_t wav_header_size = wav_make_header(wav_header, sizeof(wav_header), &wav);
    if (wav_header_size == 0) {
        err = wasm_min_set_error(result, -9, "failed to build WAV header");
        goto fail;
    }

    wav_data = malloc(wav_header_size + pcm_size);
    if (!wav_data) {
        err = wasm_min_set_error(result, -10, "failed to allocate WAV output");
        goto fail;
    }

    memcpy(wav_data, wav_header, wav_header_size);
    memcpy(wav_data + wav_header_size, pcm_data, pcm_size);

    if (!options || options->want_info_json) {
        info_json = wasm_min_build_info_json(lib);
        if (!info_json) {
            err = wasm_min_set_error(result, -11, "failed to build info json");
            goto fail;
        }
    }

    result->ok = 1;
    result->error_code = 0;
    result->error_message = NULL;
    result->audio_data = wav_data;
    result->audio_size = wav_header_size + pcm_size;
    result->info_json = info_json;

    free(decode_buf);
    free(pcm_data);
    libvgmstream_free(lib);
    return 0;
fail:
    free(decode_buf);
    free(pcm_data);
    free(wav_data);
    free(info_json);
    if (libsf)
        libstreamfile_close(libsf);
    if (lib)
        libvgmstream_free(lib);
    return err;
}

void vgmstream_web_free_result(vgmstream_web_result_t* result) {
    if (!result)
        return;

    free(result->audio_data);
    result->audio_data = NULL;
    result->audio_size = 0;

    free(result->info_json);
    result->info_json = NULL;
}
