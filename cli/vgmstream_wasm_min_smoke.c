#include "../src/vgmstream_wasm_min.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>

static uint8_t* read_file(const char* path, size_t* size) {
    FILE* file = fopen(path, "rb");
    if (!file)
        return NULL;

    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        return NULL;
    }

    long length = ftell(file);
    if (length < 0) {
        fclose(file);
        return NULL;
    }

    rewind(file);

    uint8_t* data = malloc((size_t)length);
    if (!data) {
        fclose(file);
        return NULL;
    }

    if (fread(data, 1, (size_t)length, file) != (size_t)length) {
        free(data);
        fclose(file);
        return NULL;
    }

    fclose(file);
    *size = (size_t)length;
    return data;
}

static int write_file(const char* path, const void* data, size_t size) {
    FILE* file = fopen(path, "wb");
    if (!file)
        return 0;

    int ok = fwrite(data, 1, size, file) == size;
    fclose(file);
    return ok;
}

static int print_usage(const char* progname) {
    fprintf(stderr,
            "Usage: %s --input <file> --output-wav <file> --output-json <file> [--ignore-loop]\n",
            progname);
    return 2;
}

int main(int argc, char** argv) {
    setbuf(stderr, NULL);

    const char* input = NULL;
    const char* output_wav = NULL;
    const char* output_json = NULL;
    vgmstream_web_options_t options = {
        .want_info_json = true,
        .output_format = VGMSTREAM_WEB_OUTPUT_WAV,
    };

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--input") == 0 && i + 1 < argc) {
            input = argv[++i];
        }
        else if (strcmp(argv[i], "--output-wav") == 0 && i + 1 < argc) {
            output_wav = argv[++i];
        }
        else if (strcmp(argv[i], "--output-json") == 0 && i + 1 < argc) {
            output_json = argv[++i];
        }
        else if (strcmp(argv[i], "--ignore-loop") == 0) {
            options.ignore_loop = true;
            continue;
        }
        else {
            return print_usage(argv[0]);
        }
    }

    if (!input || !output_wav || !output_json)
        return print_usage(argv[0]);

    size_t input_size = 0;
    uint8_t* input_data = read_file(input, &input_size);
    if (!input_data) {
        fprintf(stderr, "failed to read input file: %s\n", input);
        return 1;
    }

    fprintf(stderr, "loaded input: %s (%zu bytes)\n", input, input_size);

    vgmstream_web_result_t result = {0};
    int err = vgmstream_web_convert(input_data, input_size, input, &options, &result);
    free(input_data);

    if (err < 0) {
        fprintf(stderr, "%s\n", result.error_message ? result.error_message : "conversion failed");
        vgmstream_web_free_result(&result);
        return 1;
    }

    fprintf(stderr, "convert ok: wav=%zu json=%zu\n", result.audio_size, result.info_json ? strlen(result.info_json) : 0);

    if (!write_file(output_wav, result.audio_data, result.audio_size)) {
        fprintf(stderr, "failed to write wav output: %s\n", output_wav);
        vgmstream_web_free_result(&result);
        return 1;
    }

    const char* json = result.info_json ? result.info_json : "{}";
    if (!write_file(output_json, json, strlen(json))) {
        fprintf(stderr, "failed to write json output: %s\n", output_json);
        vgmstream_web_free_result(&result);
        return 1;
    }

    vgmstream_web_free_result(&result);
    return 0;
}
