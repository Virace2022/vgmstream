#include "../src/vgmstream_wasm_min.h"

static void* keep_symbols_alive[] = {
    (void*)&vgmstream_web_convert,
    (void*)&vgmstream_web_free_result,
};

int main(void) {
    return keep_symbols_alive[0] == 0;
}
