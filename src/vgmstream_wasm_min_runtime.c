#include "vgmstream_wasm_min_runtime.h"
#include "base/decode_state.h"
#include "base/seek_table.h"
#include "base/sbuf.h"
#include "coding/vorbis_custom_decoder.h"

typedef struct libstreamfile_t {
    void* user_data;
    int (*read)(void* user_data, uint8_t* dst, int64_t offset, int length);
    int64_t (*get_size)(void* user_data);
    const char* (*get_name)(void* user_data);
    struct libstreamfile_t* (*open)(void* user_data, const char* filename);
    void (*close)(struct libstreamfile_t* libsf);
} libstreamfile_t;

void libstreamfile_close(libstreamfile_t* libsf) {
    if (!libsf || !libsf->close)
        return;
    libsf->close(libsf);
}

static STREAMFILE* open_shared_streamfile(STREAMFILE* sf) {
    char filename[PATH_LIMIT];
    sf->get_name(sf, filename, sizeof(filename));
    return open_streamfile(sf, filename);
}

VGMSTREAM* allocate_vgmstream_wasm_min(int channels, int loop_flag) {
    if (channels <= 0 || channels > VGMSTREAM_MAX_CHANNELS)
        return NULL;

    VGMSTREAM* vgmstream = calloc(1, sizeof(VGMSTREAM));
    if (!vgmstream)
        return NULL;

    vgmstream->channels = channels;
    vgmstream->loop_flag = loop_flag;

    vgmstream->ch = calloc(channels, sizeof(VGMSTREAMCHANNEL));
    if (!vgmstream->ch)
        goto fail;

    vgmstream->decode_state = calloc(1, sizeof(decode_state_t));
    if (!vgmstream->decode_state)
        goto fail;

    return vgmstream;
fail:
    close_vgmstream_wasm_min(vgmstream);
    return NULL;
}

bool vgmstream_open_stream_wasm_min(VGMSTREAM* vgmstream, STREAMFILE* sf, off_t start_offset) {
    if (!vgmstream || !sf || start_offset < 0)
        return false;

    if (vgmstream->coding_type == coding_VORBIS_custom) {
        STREAMFILE* file = open_shared_streamfile(sf);
        if (!file)
            return false;

        for (int ch = 0; ch < vgmstream->channels; ch++) {
            vgmstream->ch[ch].streamfile = file;
            vgmstream->ch[ch].channel_start_offset = start_offset;
            vgmstream->ch[ch].offset = start_offset;
        }
        return true;
    }

    return false;
}

void close_vgmstream_wasm_min(VGMSTREAM* vgmstream) {
    if (!vgmstream)
        return;

    seek_table_free(vgmstream);
    vgmstream->seek_table = NULL;

    if (vgmstream->codec_data && vgmstream->coding_type == coding_VORBIS_custom) {
        free_vorbis_custom(vgmstream->codec_data);
        vgmstream->codec_data = NULL;
    }

    free(vgmstream->decode_state);
    vgmstream->decode_state = NULL;

    for (int i = 0; i < vgmstream->channels; i++) {
        if (vgmstream->ch && vgmstream->ch[i].streamfile) {
            close_streamfile(vgmstream->ch[i].streamfile);
            for (int j = 0; j < vgmstream->channels; j++) {
                if (i != j && vgmstream->ch[j].streamfile == vgmstream->ch[i].streamfile) {
                    vgmstream->ch[j].streamfile = NULL;
                }
            }
            vgmstream->ch[i].streamfile = NULL;
        }
    }

    free(vgmstream->ch);
    free(vgmstream);
}
