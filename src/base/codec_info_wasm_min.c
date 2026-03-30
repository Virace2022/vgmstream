#include "codec_info.h"

#ifdef VGM_USE_VORBIS
extern const codec_info_t vorbis_custom_decoder;
#endif

const codec_info_t* codec_get_info(VGMSTREAM* v) {
    switch(v->coding_type) {
#ifdef VGM_USE_VORBIS
        case coding_VORBIS_custom:
            return &vorbis_custom_decoder;
#endif
        default:
            return NULL;
    }
}
