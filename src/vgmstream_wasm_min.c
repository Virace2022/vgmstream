#include "vgmstream_wasm_min.h"

#include "../cli/wav_utils.h"
#include "../cli/vjson.h"
#include "../version.h"
#include "vgmstream.h"
#include "vgmstream_init.h"
#include "base/api_internal.h"
#include "base/codec_info.h"
#include "base/decode_state.h"
#include "base/sbuf.h"
#include "coding/vorbis_custom_decoder.h"
#include "vgmstream_wasm_min_runtime.h"

#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#ifndef VGMSTREAM_VERSION
#define VGMSTREAM_VERSION "unknown version " __DATE__
#endif

extern const codec_info_t vorbis_custom_decoder;

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

static char* wasm_min_build_info_json(VGMSTREAM* vgmstream) {
    char* buf = calloc(1, 0x1000);
    if (!buf)
        return NULL;

    vjson_t j = {0};
    vjson_init(&j, buf, 0x1000);

    vjson_obj_open(&j);
        vjson_keystr(&j, "version", VGMSTREAM_VERSION);
        vjson_keyint(&j, "sampleRate", vgmstream->sample_rate);
        vjson_keyint(&j, "channels", vgmstream->channels);

        vjson_key(&j, "mixingInfo");
        vjson_null(&j);

        vjson_keyintnull(&j, "channelLayout", vgmstream->channel_layout);

        vjson_key(&j, "loopingInfo");
        if (vgmstream->loop_end_sample > vgmstream->loop_start_sample) {
            vjson_obj_open(&j);
                vjson_keyint(&j, "start", vgmstream->loop_start_sample);
                vjson_keyint(&j, "end", vgmstream->loop_end_sample);
            vjson_obj_close(&j);
        }
        else {
            vjson_null(&j);
        }

        vjson_keyint(&j, "numberOfSamples", vgmstream->num_samples);
        vjson_keystr(&j, "encoding", "Custom Vorbis");
        vjson_keystr(&j, "layout", "flat");
        vjson_keystr(&j, "metadataSource", "Audiokinetic Wwise");
        vjson_keyint(&j, "bitrate", 0);

        vjson_key(&j, "streamInfo");
        vjson_obj_open(&j);
            vjson_keyint(&j, "index", vgmstream->stream_index);
            vjson_keystr(&j, "name", vgmstream->stream_name);
            vjson_keyint(&j, "total", vgmstream->num_streams);
        vjson_obj_close(&j);

        vjson_keyint(&j, "playSamples", vgmstream->num_samples);
    vjson_obj_close(&j);

    return buf;
}

static int wasm_min_decode_wwise_vorbis(VGMSTREAM* vgmstream, uint8_t** pcm_data, size_t* pcm_size, int32_t* pcm_samples) {
    decode_state_t* decode_state = vgmstream ? vgmstream->decode_state : NULL;
    if (!vgmstream || !decode_state || vgmstream->coding_type != coding_VORBIS_custom)
        return -1;

    const codec_info_t* codec_info = &vorbis_custom_decoder;
    if (!codec_info->decode_frame)
        return -1;

    int channels = vgmstream->channels;
    int32_t target_samples = vgmstream->num_samples;
    int16_t* pcm = calloc((size_t)target_samples * channels, sizeof(int16_t));
    if (!pcm)
        return -1;

    memset(decode_state, 0, sizeof(*decode_state));

    sbuf_t dst;
    sbuf_init_s16(&dst, pcm, target_samples, channels);

    int empty_reads = 0;
    while (dst.filled < dst.samples) {
        if (decode_state->sbuf.filled == 0) {
            bool ok = codec_info->decode_frame(vgmstream);
            if (!ok) {
                free(pcm);
                return -1;
            }
        }

        if (decode_state->discard > 0) {
            int samples_discard = decode_state->discard;
            if (samples_discard > decode_state->sbuf.filled)
                samples_discard = decode_state->sbuf.filled;
            sbuf_consume(&decode_state->sbuf, samples_discard);
            decode_state->discard -= samples_discard;
            continue;
        }

        if (decode_state->sbuf.filled == 0) {
            empty_reads++;
            if (empty_reads > 32) {
                free(pcm);
                return -1;
            }
            continue;
        }
        empty_reads = 0;

        int samples_copy = sbuf_get_copy_max(&dst, &decode_state->sbuf);
        if (samples_copy <= 0)
            break;

        sbuf_copy_segments(&dst, &decode_state->sbuf, samples_copy);
        sbuf_consume(&decode_state->sbuf, samples_copy);
    }

    *pcm_data = (uint8_t*)pcm;
    *pcm_size = (size_t)dst.filled * channels * sizeof(int16_t);
    *pcm_samples = dst.filled;
    return 0;
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
    STREAMFILE* api_sf = NULL;
    VGMSTREAM* vgmstream = NULL;
    uint8_t* pcm_data = NULL;
    uint8_t* wav_data = NULL;
    char* info_json = NULL;
    size_t pcm_size = 0;
    int32_t total_samples = 0;
    int err = -1;

    libsf = wasm_min_streamfile_open_internal(input_data, input_size, input_name);
    if (!libsf)
        return wasm_min_set_error(result, -3, "failed to create in-memory streamfile");

    api_sf = open_api_streamfile(libsf);
    if (!api_sf) {
        err = wasm_min_set_error(result, -4, "failed to create API streamfile");
        goto fail;
    }

    vgmstream = init_vgmstream_wwise(api_sf);
    close_streamfile(api_sf);
    api_sf = NULL;
    libstreamfile_close(libsf);
    libsf = NULL;
    if (!vgmstream) {
        err = wasm_min_set_error(result, -5, "input is not a supported Wwise stream");
        goto fail;
    }

    if (options && options->ignore_loop) {
        vgmstream->loop_flag = false;
    }

    err = wasm_min_decode_wwise_vorbis(vgmstream, &pcm_data, &pcm_size, &total_samples);
    if (err < 0) {
        err = wasm_min_set_error(result, -6, "failed to decode Wwise Vorbis stream");
        goto fail;
    }

    wav_header_t wav = {
        .sample_count = total_samples,
        .sample_rate = vgmstream->sample_rate,
        .channels = vgmstream->channels,
        .sample_size = sizeof(int16_t),
        .is_float = false,
    };
    uint8_t wav_header[0x100];
    size_t wav_header_size = wav_make_header(wav_header, sizeof(wav_header), &wav);
    if (wav_header_size == 0) {
        err = wasm_min_set_error(result, -7, "failed to build WAV header");
        goto fail;
    }

    wav_data = malloc(wav_header_size + pcm_size);
    if (!wav_data) {
        err = wasm_min_set_error(result, -8, "failed to allocate WAV output");
        goto fail;
    }

    memcpy(wav_data, wav_header, wav_header_size);
    memcpy(wav_data + wav_header_size, pcm_data, pcm_size);

    if (!options || options->want_info_json) {
        info_json = wasm_min_build_info_json(vgmstream);
        if (!info_json) {
            err = wasm_min_set_error(result, -9, "failed to build info json");
            goto fail;
        }
    }

    result->ok = 1;
    result->error_code = 0;
    result->error_message = NULL;
    result->audio_data = wav_data;
    result->audio_size = wav_header_size + pcm_size;
    result->info_json = info_json;

    free(pcm_data);
    close_vgmstream_wasm_min(vgmstream);
    return 0;
fail:
    free(pcm_data);
    free(wav_data);
    free(info_json);
    if (libsf)
        libstreamfile_close(libsf);
    if (api_sf)
        close_streamfile(api_sf);
    if (vgmstream)
        close_vgmstream_wasm_min(vgmstream);
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
