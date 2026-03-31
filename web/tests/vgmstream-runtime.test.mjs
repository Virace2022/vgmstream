import test from 'node:test';
import assert from 'node:assert/strict';

const runtimeModuleUrl = new URL('../pages/assets/vgmstream-runtime.mjs', import.meta.url);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function loadRuntimeModule() {
  return import(`${runtimeModuleUrl.href}?cacheBust=${Date.now()}-${Math.random()}`);
}

function createFakeEmscriptenModule() {
  const buffer = new ArrayBuffer(4096);
  const HEAPU8 = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let nextPtr = 256;
  const freedPointers = [];
  const writtenInputs = [];
  let freeResultCalls = 0;

  function writeCString(text) {
    const bytes = new TextEncoder().encode(text);
    const ptr = nextPtr;
    HEAPU8.set(bytes, ptr);
    HEAPU8[ptr + bytes.length] = 0;
    nextPtr += bytes.length + 1;
    return ptr;
  }

  function readCString(ptr) {
    let end = ptr;
    while (HEAPU8[end] !== 0) {
      end += 1;
    }
    return new TextDecoder().decode(HEAPU8.slice(ptr, end));
  }

  function writeResultStruct(resultPtr, payload) {
    view.setInt32(resultPtr + 0, payload.ok, true);
    view.setInt32(resultPtr + 4, payload.errorCode, true);
    view.setUint32(resultPtr + 8, payload.errorMessagePtr ?? 0, true);
    view.setUint32(resultPtr + 12, payload.audioDataPtr ?? 0, true);
    view.setUint32(resultPtr + 16, payload.audioSize ?? 0, true);
    view.setUint32(resultPtr + 20, payload.infoJsonPtr ?? 0, true);
  }

  return {
    HEAPU8,
    _malloc(size) {
      const ptr = nextPtr;
      nextPtr += size;
      return ptr;
    },
    _free(ptr) {
      freedPointers.push(ptr);
    },
    UTF8ToString(ptr) {
      return readCString(ptr);
    },
    ccall(name, _returnType, _argTypes, values) {
      if (name === 'vgmstream_web_convert') {
        const [inputPtr, inputSize, inputNamePtr, optionsPtr, resultPtr] = values;
        const audioDataPtr = this._malloc(8);
        const infoJsonPtr = writeCString('{"sampleRate":48000,"channels":2}');

        HEAPU8.set(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]), audioDataPtr);
        writtenInputs.push({
          name: readCString(inputNamePtr),
          bytes: Array.from(HEAPU8.slice(inputPtr, inputPtr + inputSize)),
          ignoreLoop: view.getUint8(optionsPtr + 0),
          wantInfoJson: view.getUint8(optionsPtr + 1),
          outputFormat: view.getInt32(optionsPtr + 4, true),
        });

        writeResultStruct(resultPtr, {
          ok: 1,
          errorCode: 0,
          audioDataPtr,
          audioSize: 8,
          infoJsonPtr,
        });
        return 0;
      }

      if (name === 'vgmstream_web_free_result') {
        freeResultCalls += 1;
        const [resultPtr] = values;
        const audioPtr = view.getUint32(resultPtr + 12, true);
        const infoPtr = view.getUint32(resultPtr + 20, true);
        if (audioPtr) {
          freedPointers.push(audioPtr);
          view.setUint32(resultPtr + 12, 0, true);
        }
        if (infoPtr) {
          freedPointers.push(infoPtr);
          view.setUint32(resultPtr + 20, 0, true);
        }
        return undefined;
      }

      throw new Error(`Unexpected ccall: ${name}`);
    },
    __inspect() {
      return {
        freedPointers,
        writtenInputs,
        freeResultCalls,
      };
    },
  };
}

function createGrowingEmscriptenModule() {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 8 });
  let heap = new Uint8Array(memory.buffer);
  let nextPtr = 256;
  let mallocCalls = 0;

  const module = {
    get HEAPU8() {
      return heap;
    },
    _malloc(size) {
      mallocCalls += 1;
      if (mallocCalls <= 3) {
        memory.grow(1);
        heap = new Uint8Array(memory.buffer);
      }
      const ptr = nextPtr;
      nextPtr += size;
      return ptr;
    },
    _free() {},
    UTF8ToString(ptr) {
      let end = ptr;
      while (heap[end] !== 0) {
        end += 1;
      }
      return new TextDecoder().decode(heap.slice(ptr, end));
    },
    ccall(name, _returnType, _argTypes, values) {
      if (name !== 'vgmstream_web_convert' && name !== 'vgmstream_web_free_result') {
        throw new Error(`Unexpected ccall: ${name}`);
      }

      const view = new DataView(memory.buffer);

      if (name === 'vgmstream_web_convert') {
        const resultPtr = values[4];
        const audioDataPtr = this._malloc(8);
        const infoJsonPtr = this._malloc(32);
        heap.set([82, 73, 70, 70, 0, 0, 0, 0], audioDataPtr);
        const infoJsonBytes = new TextEncoder().encode('{"sampleRate":44100}');
        heap.set(infoJsonBytes, infoJsonPtr);
        heap[infoJsonPtr + infoJsonBytes.length] = 0;

        view.setInt32(resultPtr + 0, 1, true);
        view.setInt32(resultPtr + 4, 0, true);
        view.setUint32(resultPtr + 8, 0, true);
        view.setUint32(resultPtr + 12, audioDataPtr, true);
        view.setUint32(resultPtr + 16, 8, true);
        view.setUint32(resultPtr + 20, infoJsonPtr, true);
        return 0;
      }

      view.setUint32(values[0] + 12, 0, true);
      view.setUint32(values[0] + 20, 0, true);
      return undefined;
    },
  };

  return module;
}

test('runtime manager starts idle', async () => {
  const { createVgmstreamRuntimeManager } = await loadRuntimeModule();
  const manager = createVgmstreamRuntimeManager({
    loadModule: async () => ({ tag: 'ready-module' }),
    now: () => 1,
  });

  assert.deepEqual(manager.getState(), {
    status: 'idle',
    ready: false,
    lastError: null,
    metrics: {
      wasmFetchMs: null,
      wasmInstantiateMs: null,
      cacheHit: false,
    },
  });
});

test('warmup shares one in-flight load', async () => {
  const { createVgmstreamRuntimeManager } = await loadRuntimeModule();
  const gate = deferred();
  let loadCalls = 0;

  const manager = createVgmstreamRuntimeManager({
    loadModule: async () => {
      loadCalls += 1;
      return gate.promise;
    },
    now: () => 5,
  });

  const first = manager.warmup();
  const second = manager.warmup();

  assert.equal(loadCalls, 1);
  assert.equal(manager.getState().status, 'loading');

  gate.resolve({ tag: 'shared-module' });

  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.tag, 'shared-module');
  assert.equal(secondResult.tag, 'shared-module');
  assert.equal(loadCalls, 1);
  assert.equal(manager.getState().status, 'ready');
  assert.equal(manager.getState().ready, true);
});

test('warmup reuses ready module until reload', async () => {
  const { createVgmstreamRuntimeManager } = await loadRuntimeModule();
  let loadCalls = 0;

  const manager = createVgmstreamRuntimeManager({
    loadModule: async () => {
      loadCalls += 1;
      return { tag: `module-${loadCalls}` };
    },
    now: () => 10,
  });

  const first = await manager.warmup();
  const second = await manager.warmup();

  assert.equal(loadCalls, 1);
  assert.equal(first.tag, 'module-1');
  assert.equal(second.tag, 'module-1');

  await manager.reload();
  const third = await manager.warmup();

  assert.equal(loadCalls, 2);
  assert.equal(third.tag, 'module-2');
  assert.equal(manager.getState().status, 'ready');
});

test('decodeFile reuses the warmed runtime', async () => {
  const { createVgmstreamRuntimeManager } = await loadRuntimeModule();
  let loadCalls = 0;
  let decodeCalls = 0;

  const manager = createVgmstreamRuntimeManager({
    loadModule: async () => {
      loadCalls += 1;
      return { tag: `module-${loadCalls}` };
    },
    decodeWithModule: async (module, file, options) => {
      decodeCalls += 1;
      return {
        moduleTag: module.tag,
        fileName: file.name,
        userActionAt: options.userActionAt,
      };
    },
    now: () => 12,
  });

  const first = await manager.decodeFile({ name: 'first.wem' }, { userActionAt: 10 });
  const second = await manager.decodeFile({ name: 'second.wem' }, { userActionAt: 11 });

  assert.equal(loadCalls, 1);
  assert.equal(decodeCalls, 2);
  assert.equal(first.moduleTag, 'module-1');
  assert.equal(second.moduleTag, 'module-1');
  assert.equal(first.fileName, 'first.wem');
  assert.equal(second.fileName, 'second.wem');
});

test('decodeFile reports timing metrics for the current request', async () => {
  const { createVgmstreamRuntimeManager } = await loadRuntimeModule();
  const ticks = [0, 10, 20, 35];

  const manager = createVgmstreamRuntimeManager({
    loadModule: async () => ({ tag: 'metric-module' }),
    decodeWithModule: async () => ({
      ok: true,
    }),
    now: () => ticks.shift(),
  });

  const result = await manager.decodeFile({ name: 'timed.wem' }, { userActionAt: 5 });

  assert.deepEqual(result.metrics, {
    wasmFetchMs: 10,
    wasmInstantiateMs: 0,
    cacheHit: false,
    userActionToDecodeStartMs: 15,
    decodeMs: 15,
  });
});

test('emscripten decode helper marshals input and frees native buffers', async () => {
  const { createEmscriptenDecodeWithModule } = await loadRuntimeModule();
  const fakeModule = createFakeEmscriptenModule();
  const decode = createEmscriptenDecodeWithModule({
    createObjectUrl: (blob) => `blob:${blob.size}`,
  });

  const result = await decode(fakeModule, {
    name: 'demo.wem',
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3, 4]).buffer;
    },
  }, {
    ignoreLoop: true,
    wantInfoJson: true,
  });

  assert.equal(result.fileName, 'demo.wem');
  assert.equal(result.objectUrl, 'blob:8');
  assert.deepEqual(Array.from(result.wavBytes), [82, 73, 70, 70, 0, 0, 0, 0]);
  assert.equal(result.infoJson.sampleRate, 48000);
  assert.equal(result.infoJson.channels, 2);

  const inspection = fakeModule.__inspect();
  assert.equal(inspection.freeResultCalls, 1);
  assert.deepEqual(inspection.writtenInputs[0], {
    name: 'demo.wem',
    bytes: [1, 2, 3, 4],
    ignoreLoop: 1,
    wantInfoJson: 1,
    outputFormat: 1,
  });
  assert.ok(inspection.freedPointers.length >= 4);
});

test('emscripten decode helper supports minimum-runtime global heap arrays', async () => {
  const { createEmscriptenDecodeWithModule } = await loadRuntimeModule();
  const fakeModule = createFakeEmscriptenModule();
  const moduleWithoutHeap = {
    ...fakeModule,
    HEAPU8: undefined,
  };
  const decode = createEmscriptenDecodeWithModule({
    createObjectUrl: () => null,
  });

  globalThis.HEAPU8 = fakeModule.HEAPU8;

  try {
    const result = await decode(moduleWithoutHeap, {
      name: 'minimum-runtime.wem',
      async arrayBuffer() {
        return new Uint8Array([9, 8, 7]).buffer;
      },
    }, {});

    assert.equal(result.fileName, 'minimum-runtime.wem');
    assert.deepEqual(Array.from(result.wavBytes), [82, 73, 70, 70, 0, 0, 0, 0]);
  } finally {
    delete globalThis.HEAPU8;
  }
});

test('failed warmup records error and can recover on retry', async () => {
  const { createVgmstreamRuntimeManager } = await loadRuntimeModule();
  let loadCalls = 0;

  const manager = createVgmstreamRuntimeManager({
    loadModule: async () => {
      loadCalls += 1;
      if (loadCalls === 1) {
        throw new Error('boom');
      }
      return { tag: 'recovered-module' };
    },
    now: () => 15,
  });

  await assert.rejects(() => manager.warmup(), /boom/);

  assert.equal(manager.getState().status, 'error');
  assert.equal(manager.getState().ready, false);
  assert.match(manager.getState().lastError.message, /boom/);

  const recovered = await manager.warmup();

  assert.equal(loadCalls, 2);
  assert.equal(recovered.tag, 'recovered-module');
  assert.equal(manager.getState().status, 'ready');
});

test('decode helper survives wasm memory growth during allocations', async () => {
  const { createEmscriptenDecodeWithModule } = await loadRuntimeModule();
  const module = createGrowingEmscriptenModule();
  const decode = createEmscriptenDecodeWithModule({
    createObjectUrl: () => null,
  });

  const result = await decode(module, {
    name: 'big-file.wem',
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3, 4, 5]).buffer;
    },
  }, {});

  assert.equal(result.fileName, 'big-file.wem');
  assert.deepEqual(Array.from(result.wavBytes), [82, 73, 70, 70, 0, 0, 0, 0]);
  assert.equal(result.infoJson.sampleRate, 44100);
});
