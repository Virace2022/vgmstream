#include "vgmstream_init.h"

/* minimal parser registry for wasm-min */
init_vgmstream_t init_vgmstream_functions[] = {
    init_vgmstream_wwise,
};

#define LOCAL_ARRAY_LENGTH(array) (sizeof(array) / sizeof(array[0]))
static const int init_vgmstream_count = LOCAL_ARRAY_LENGTH(init_vgmstream_functions);

VGMSTREAM* detect_vgmstream_format(STREAMFILE* sf) {
    if (!sf)
        return NULL;

    for (int i = 0; i < init_vgmstream_count; i++) {
        init_vgmstream_t init_vgmstream_function = init_vgmstream_functions[i];

        VGMSTREAM* vgmstream = init_vgmstream_function(sf);
        if (!vgmstream)
            continue;

        vgmstream->format_id = i + 1;

        if (!prepare_vgmstream(vgmstream, sf)) {
            close_vgmstream(vgmstream);
            continue;
        }

        return vgmstream;
    }

    return NULL;
}

init_vgmstream_t get_vgmstream_format_init(int format_id) {
    if (format_id <= 0 || format_id > init_vgmstream_count)
        return NULL;

    return init_vgmstream_functions[format_id - 1];
}
