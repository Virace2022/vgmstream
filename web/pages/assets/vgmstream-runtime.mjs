function createEmptyMetrics() {
  return {
    wasmFetchMs: null,
    wasmInstantiateMs: null,
    cacheHit: false,
  };
}

function cloneMetrics(metrics) {
  return {
    wasmFetchMs: metrics.wasmFetchMs,
    wasmInstantiateMs: metrics.wasmInstantiateMs,
    cacheHit: metrics.cacheHit,
  };
}

function normalizeError(error) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

const RESULT_LAYOUT = {
  ok: 0,
  errorCode: 4,
  errorMessagePtr: 8,
  audioDataPtr: 12,
  audioSize: 16,
  infoJsonPtr: 20,
  size: 24,
};

const OPTIONS_LAYOUT = {
  ignoreLoop: 0,
  wantInfoJson: 1,
  outputFormat: 4,
  size: 8,
};

function getHeapU8(module) {
  return globalThis.HEAPU8 ?? module.HEAPU8;
}

function getHeapView(module) {
  return new DataView(getHeapU8(module).buffer);
}

function allocateBytes(module, bytes) {
  const ptr = module._malloc(bytes.length);
  const heap = getHeapU8(module);
  heap.set(bytes, ptr);
  return ptr;
}

function allocateCString(module, text) {
  const bytes = new TextEncoder().encode(text);
  const ptr = module._malloc(bytes.length + 1);
  const heap = getHeapU8(module);
  heap.set(bytes, ptr);
  heap[ptr + bytes.length] = 0;
  return ptr;
}

function writeOptions(module, options) {
  const ptr = module._malloc(OPTIONS_LAYOUT.size);
  const heap = getHeapU8(module);
  const view = getHeapView(module);
  heap.fill(0, ptr, ptr + OPTIONS_LAYOUT.size);
  view.setUint8(ptr + OPTIONS_LAYOUT.ignoreLoop, options.ignoreLoop ? 1 : 0);
  view.setUint8(ptr + OPTIONS_LAYOUT.wantInfoJson, options.wantInfoJson ? 1 : 0);
  view.setInt32(ptr + OPTIONS_LAYOUT.outputFormat, options.outputFormat ?? 1, true);
  return ptr;
}

function readResultStruct(module, resultPtr) {
  const view = getHeapView(module);
  return {
    ok: view.getInt32(resultPtr + RESULT_LAYOUT.ok, true),
    errorCode: view.getInt32(resultPtr + RESULT_LAYOUT.errorCode, true),
    errorMessagePtr: view.getUint32(resultPtr + RESULT_LAYOUT.errorMessagePtr, true),
    audioDataPtr: view.getUint32(resultPtr + RESULT_LAYOUT.audioDataPtr, true),
    audioSize: view.getUint32(resultPtr + RESULT_LAYOUT.audioSize, true),
    infoJsonPtr: view.getUint32(resultPtr + RESULT_LAYOUT.infoJsonPtr, true),
  };
}

export function createEmscriptenDecodeWithModule({
  BlobClass = Blob,
  createObjectUrl = (blob) => URL.createObjectURL(blob),
} = {}) {
  return async function decodeWithModule(module, file, options = {}) {
    const allocations = [];
    const resultPtr = module._malloc(RESULT_LAYOUT.size);
    const resultHeap = getHeapU8(module);
    allocations.push(resultPtr);
    resultHeap.fill(0, resultPtr, resultPtr + RESULT_LAYOUT.size);

    try {
      const inputBytes = new Uint8Array(await file.arrayBuffer());
      const inputPtr = allocateBytes(module, inputBytes);
      const namePtr = allocateCString(module, file.name);
      const optionsPtr = writeOptions(module, {
        ignoreLoop: options.ignoreLoop ?? false,
        wantInfoJson: options.wantInfoJson ?? true,
        outputFormat: 1,
      });

      allocations.push(inputPtr, namePtr, optionsPtr);

      const convertResult = typeof module._vgmstream_web_convert === 'function'
        ? module._vgmstream_web_convert(inputPtr, inputBytes.length, namePtr, optionsPtr, resultPtr)
        : module.ccall(
          'vgmstream_web_convert',
          'number',
          ['number', 'number', 'number', 'number', 'number'],
          [inputPtr, inputBytes.length, namePtr, optionsPtr, resultPtr],
        );

      const nativeResult = readResultStruct(module, resultPtr);
      if (convertResult < 0 || nativeResult.ok !== 1) {
        const message = nativeResult.errorMessagePtr
          ? module.UTF8ToString(nativeResult.errorMessagePtr)
          : 'vgmstream_web_convert failed';
        const error = new Error(message);
        error.code = nativeResult.errorCode || convertResult;
        throw error;
      }

      const currentHeap = getHeapU8(module);
      const wavBytes = currentHeap.slice(
        nativeResult.audioDataPtr,
        nativeResult.audioDataPtr + nativeResult.audioSize,
      );
      const wavBlob = new BlobClass([wavBytes], { type: 'audio/wav' });
      const infoJsonText = nativeResult.infoJsonPtr
        ? module.UTF8ToString(nativeResult.infoJsonPtr)
        : null;

      return {
        fileName: file.name,
        wavBytes,
        wavBlob,
        objectUrl: typeof createObjectUrl === 'function' ? createObjectUrl(wavBlob) : null,
        infoJsonText,
        infoJson: infoJsonText ? JSON.parse(infoJsonText) : null,
      };
    } finally {
      if (typeof module._vgmstream_web_free_result === 'function') {
        module._vgmstream_web_free_result(resultPtr);
      } else {
        module.ccall('vgmstream_web_free_result', null, ['number'], [resultPtr]);
      }
      while (allocations.length > 0) {
        module._free(allocations.pop());
      }
    }
  };
}

export function createBrowserModuleLoader({
  scriptUrl = './vgmstream_wasm_min.js',
  wasmUrl = './vgmstream_wasm_min.wasm',
  globalScope = globalThis,
  documentRef = globalScope.document,
} = {}) {
  let loadPromise = null;
  let scriptElement = null;

  function isModuleReady(moduleConfig) {
    return Boolean(
      moduleConfig.calledRun &&
      typeof moduleConfig.ccall === 'function' &&
      typeof moduleConfig._malloc === 'function',
    );
  }

  async function loadModule() {
    if (globalScope.__vgmstreamBrowserModule?.ccall) {
      return globalScope.__vgmstreamBrowserModule;
    }

    if (loadPromise) {
      return loadPromise;
    }

    if (!documentRef) {
      throw new Error('document is required to load the browser wasm module');
    }

    loadPromise = new Promise((resolve, reject) => {
      const moduleConfig = globalScope.Module && typeof globalScope.Module === 'object'
        ? globalScope.Module
        : {};
      let settled = false;
      let readyPoll = null;
      let readyTimeout = null;
      const resolveModule = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (readyPoll) {
          globalScope.clearInterval(readyPoll);
        }
        if (readyTimeout) {
          globalScope.clearTimeout(readyTimeout);
        }
        if (!moduleConfig.HEAPU8 && globalScope.HEAPU8) {
          moduleConfig.HEAPU8 = globalScope.HEAPU8;
        }
        globalScope.__vgmstreamBrowserModule = moduleConfig;
        resolve(moduleConfig);
      };
      const rejectModule = (reason) => {
        if (settled) {
          return;
        }
        settled = true;
        loadPromise = null;
        if (readyPoll) {
          globalScope.clearInterval(readyPoll);
        }
        if (readyTimeout) {
          globalScope.clearTimeout(readyTimeout);
        }
        reject(normalizeError(reason));
      };
      const startReadyPolling = () => {
        readyPoll = globalScope.setInterval(() => {
          if (isModuleReady(moduleConfig)) {
            resolveModule();
          }
        }, 25);
        readyTimeout = globalScope.setTimeout(() => {
          rejectModule(new Error(`timed out waiting for wasm module readiness: ${scriptUrl}`));
        }, 30000);
      };

      moduleConfig.locateFile = (path) => {
        if (path.endsWith('.wasm')) {
          return wasmUrl;
        }
        return path;
      };
      moduleConfig.onRuntimeInitialized = () => {
        if (isModuleReady(moduleConfig)) {
          resolveModule();
        }
      };
      moduleConfig.onAbort = (reason) => {
        rejectModule(reason);
      };

      globalScope.Module = moduleConfig;

      scriptElement = documentRef.createElement('script');
      scriptElement.src = scriptUrl;
      scriptElement.async = true;
      scriptElement.dataset.vgmstreamWasm = 'true';
      scriptElement.addEventListener('load', () => {
        if (isModuleReady(moduleConfig)) {
          resolveModule();
          return;
        }
        startReadyPolling();
      }, { once: true });
      scriptElement.addEventListener('error', () => {
        rejectModule(new Error(`failed to load wasm script: ${scriptUrl}`));
      }, { once: true });
      documentRef.head.appendChild(scriptElement);
    });

    return loadPromise;
  }

  loadModule.reset = () => {
    loadPromise = null;
    if (scriptElement) {
      scriptElement.remove();
      scriptElement = null;
    }
    delete globalScope.__vgmstreamBrowserModule;
    delete globalScope.Module;
  };

  return loadModule;
}

export function createVgmstreamRuntimeManager({
  loadModule,
  decodeWithModule = createEmscriptenDecodeWithModule(),
  now = () => Date.now(),
} = {}) {
  if (typeof loadModule !== 'function') {
    throw new TypeError('loadModule must be a function');
  }

  if (typeof decodeWithModule !== 'function') {
    throw new TypeError('decodeWithModule must be a function');
  }

  let moduleInstance = null;
  let inFlightLoad = null;
  let lastError = null;
  let status = 'idle';
  let metrics = createEmptyMetrics();

  function getState() {
    return {
      status,
      ready: moduleInstance !== null,
      lastError,
      metrics: cloneMetrics(metrics),
    };
  }

  async function warmup() {
    if (moduleInstance !== null) {
      metrics.cacheHit = true;
      return moduleInstance;
    }

    if (inFlightLoad !== null) {
      return inFlightLoad;
    }

    status = 'loading';
    lastError = null;
    metrics = createEmptyMetrics();

    const fetchStart = now();

    inFlightLoad = (async () => {
      try {
        const loadedModule = await loadModule();
        const fetchEnd = now();

        moduleInstance = loadedModule;
        status = 'ready';
        metrics = {
          wasmFetchMs: Math.max(0, fetchEnd - fetchStart),
          wasmInstantiateMs: 0,
          cacheHit: false,
        };

        return moduleInstance;
      } catch (error) {
        moduleInstance = null;
        status = 'error';
        lastError = normalizeError(error);
        throw lastError;
      } finally {
        inFlightLoad = null;
      }
    })();

    return inFlightLoad;
  }

  async function decodeFile(file, options = {}) {
    const runtime = await warmup();
    const decodeStart = now();
    const decoded = await decodeWithModule(runtime, file, options);
    const decodeEnd = now();

    return {
      ...decoded,
      metrics: {
        wasmFetchMs: metrics.wasmFetchMs,
        wasmInstantiateMs: metrics.wasmInstantiateMs,
        cacheHit: metrics.cacheHit,
        userActionToDecodeStartMs: typeof options.userActionAt === 'number'
          ? Math.max(0, decodeStart - options.userActionAt)
          : null,
        decodeMs: Math.max(0, decodeEnd - decodeStart),
      },
    };
  }

  async function reload() {
    if (typeof loadModule.reset === 'function') {
      loadModule.reset();
    }
    moduleInstance = null;
    inFlightLoad = null;
    lastError = null;
    status = 'idle';
    metrics = createEmptyMetrics();
  }

  return {
    warmup,
    decodeFile,
    reload,
    getState,
  };
}
