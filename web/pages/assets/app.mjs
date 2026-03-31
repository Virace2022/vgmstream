import { createPlayerController } from './player-controller.mjs';
import { createBrowserModuleLoader, createVgmstreamRuntimeManager } from './vgmstream-runtime.mjs';

const runtime = createVgmstreamRuntimeManager({
  loadModule: createBrowserModuleLoader({
    scriptUrl: './assets/vgmstream_wasm_min.js',
    wasmUrl: './assets/vgmstream_wasm_min.wasm',
  }),
  now: () => performance.now(),
});

const controller = createPlayerController();
const metricKeys = [
  'wasmFetchMs',
  'wasmInstantiateMs',
  'userActionToDecodeStartMs',
  'decodeMs',
  'userActionToPlaybackStartMs',
  'wavExportMs',
  'fileSizeBytes',
  'wavSizeBytes',
];

function debugLog(label, payload) {
  console.groupCollapsed(`[wasm-demo] ${label}`);
  console.log(payload);
  console.groupEnd();
}

function formatMilliseconds(value) {
  return typeof value === 'number' ? `${value.toFixed(1)} ms` : '--';
}

function formatBytes(value) {
  if (typeof value !== 'number') {
    return '--';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatSeconds(value) {
  if (!Number.isFinite(value)) {
    return '--:--';
  }
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function revokeDecodedResult(decodedResult) {
  if (decodedResult?.objectUrl) {
    URL.revokeObjectURL(decodedResult.objectUrl);
  }
}

function supportsPickerApi() {
  return typeof window.showOpenFilePicker === 'function' && typeof window.showDirectoryPicker === 'function';
}

function createLazyLocalFile({ name, label, getFile }) {
  let cachedFile = null;

  return {
    name,
    webkitRelativePath: label,
    size: null,
    async getFile() {
      if (!cachedFile) {
        cachedFile = await getFile();
        this.size = cachedFile.size;
        this.type = cachedFile.type;
        this.lastModified = cachedFile.lastModified;
      }
      return cachedFile;
    },
    async arrayBuffer() {
      return (await this.getFile()).arrayBuffer();
    },
  };
}

async function walkDirectoryHandles(directoryHandle, prefix = '') {
  const entries = [];

  for await (const [name, handle] of directoryHandle.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      entries.push(...await walkDirectoryHandles(handle, relativePath));
      continue;
    }

    entries.push(createLazyLocalFile({
      name,
      label: relativePath,
      getFile: () => handle.getFile(),
    }));
  }

  return entries;
}

async function ensureTrackFileMetadata(track) {
  if (!track) {
    return null;
  }

  if (typeof track.file.size === 'number') {
    return track.file;
  }

  if (typeof track.file.getFile === 'function') {
    await track.file.getFile();
  }

  return track.file;
}

function collectDom() {
  return {
    openFileButton: document.querySelector('[data-role="open-file"]'),
    openFolderButton: document.querySelector('[data-role="open-folder"]'),
    reloadButton: document.querySelector('[data-role="reload-wasm"]'),
    downloadButton: document.querySelector('[data-role="download-wav"]'),
    runtimeStatus: document.querySelector('[data-role="runtime-status"]'),
    trackList: document.querySelector('[data-role="track-list"]'),
    currentTrackLabel: document.querySelector('[data-role="current-track-label"]'),
    audioPlayer: document.querySelector('[data-role="audio-player"]'),
    playbackTime: document.querySelector('[data-role="playback-time"]'),
    detailFileSize: document.querySelector('[data-role="detail-file-size"]'),
    detailWavSize: document.querySelector('[data-role="detail-wav-size"]'),
    detailSampleRate: document.querySelector('[data-role="detail-sample-rate"]'),
    detailChannels: document.querySelector('[data-role="detail-channels"]'),
    detailDuration: document.querySelector('[data-role="detail-duration"]'),
    singleFileInput: document.querySelector('[data-role="single-file-input"]'),
    folderInput: document.querySelector('[data-role="folder-input"]'),
    pickerHint: document.querySelector('[data-role="picker-hint"]'),
    metrics: Object.fromEntries(
      metricKeys.map((key) => [key, document.querySelector(`[data-metric="${key}"]`)]),
    ),
  };
}

function renderTrackList(dom) {
  const { tracks, selectedTrackId, currentTrackId } = controller.getState();
  dom.trackList.innerHTML = '';

  if (tracks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'track-list__empty';
    empty.textContent = 'Add a .wem file or folder to build a local playlist.';
    dom.trackList.appendChild(empty);
    return;
  }

  for (const track of tracks) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'track-list__item';
    if (track.id === selectedTrackId) {
      item.classList.add('is-selected');
    }
    if (track.id === currentTrackId) {
      item.classList.add('is-current');
    }
    item.textContent = track.label;
    item.dataset.trackId = track.id;
    dom.trackList.appendChild(item);
  }
}

function syncTrackListState(dom) {
  const { selectedTrackId, currentTrackId } = controller.getState();
  for (const item of dom.trackList.querySelectorAll('[data-track-id]')) {
    item.classList.toggle('is-selected', item.dataset.trackId === selectedTrackId);
    item.classList.toggle('is-current', item.dataset.trackId === currentTrackId);
  }
}

function renderPlaybackTime(dom) {
  dom.playbackTime.textContent =
    `${formatSeconds(dom.audioPlayer.currentTime)} / ${formatSeconds(dom.audioPlayer.duration)}`;
}

function renderDetails(dom) {
  const state = controller.getState();
  const focusedTrack = controller.getFocusedTrack();
  const info = state.decodedTrackId && focusedTrack && state.decodedTrackId === focusedTrack.id
    ? state.decodedResult?.infoJson ?? null
    : null;

  dom.runtimeStatus.textContent = `Status: ${state.runtimeStatus}`;
  dom.currentTrackLabel.textContent = focusedTrack ? focusedTrack.label : 'No track selected';
  dom.downloadButton.disabled = !state.downloadReady;

  dom.detailFileSize.textContent = focusedTrack ? formatBytes(focusedTrack.file.size) : '--';
  dom.detailWavSize.textContent = state.decodedTrackId && focusedTrack && state.decodedTrackId === focusedTrack.id && state.decodedResult
    ? formatBytes(state.decodedResult.wavBytes.byteLength)
    : '--';
  dom.detailSampleRate.textContent = info?.sampleRate ? `${info.sampleRate} Hz` : '--';
  dom.detailChannels.textContent = info?.channels ? String(info.channels) : '--';
  dom.detailDuration.textContent = info?.sampleRate && info?.numberOfSamples
    ? `${(info.numberOfSamples / info.sampleRate).toFixed(2)} s`
    : '--';

  for (const key of metricKeys) {
    const target = dom.metrics[key];
    if (!target) {
      continue;
    }

    const value = state.metrics[key];
    target.textContent = key.endsWith('Bytes') ? formatBytes(value) : formatMilliseconds(value);
  }
}

function render(dom) {
  renderTrackList(dom);
  renderDetails(dom);
  renderPlaybackTime(dom);
}

function renderWithoutRebuildingList(dom) {
  syncTrackListState(dom);
  renderDetails(dom);
  renderPlaybackTime(dom);
}

function downloadCurrentTrack() {
  const state = controller.getState();
  if (!state.decodedResult) {
    return;
  }

  const anchor = document.createElement('a');
  const baseName = state.decodedResult.fileName.replace(/\.[^.]+$/, '');
  anchor.href = state.decodedResult.objectUrl;
  anchor.download = `${baseName}.wav`;
  anchor.click();
}

async function waitForPlaybackStart(audioPlayer) {
  if (!audioPlayer.paused && audioPlayer.readyState >= 2) {
    return;
  }

  await new Promise((resolve, reject) => {
    const onPlaying = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(audioPlayer.error ?? new Error('audio playback failed'));
    };
    const cleanup = () => {
      audioPlayer.removeEventListener('playing', onPlaying);
      audioPlayer.removeEventListener('error', onError);
    };

    audioPlayer.addEventListener('playing', onPlaying);
    audioPlayer.addEventListener('error', onError);
  });
}

async function decodeAndPlay(dom, track, userActionAt) {
  if (!track) {
    return;
  }

  await ensureTrackFileMetadata(track);

  const previousDecoded = controller.getState().decodedResult;
  if (previousDecoded && previousDecoded.trackId !== track.id) {
    revokeDecodedResult(previousDecoded);
  }

  controller.activateTrack(track.id);
  controller.setRuntimeStatus('decoding');
  renderWithoutRebuildingList(dom);
  debugLog('decode-requested', {
    track: track.label,
    userActionAt,
  });

  try {
    const decodedResult = await runtime.decodeFile(track.file, {
      ignoreLoop: true,
      wantInfoJson: true,
      userActionAt,
    });

    decodedResult.trackId = track.id;
    controller.setDecodedResult(decodedResult);
    controller.updateMetrics({
      ...decodedResult.metrics,
      fileSizeBytes: track.file.size,
      wavSizeBytes: decodedResult.wavBytes.byteLength,
    });

    dom.audioPlayer.src = decodedResult.objectUrl;
    dom.audioPlayer.currentTime = 0;
    await dom.audioPlayer.play();
    await waitForPlaybackStart(dom.audioPlayer);

    controller.setRuntimeStatus('playing');
    controller.updateMetrics({
      userActionToPlaybackStartMs: Math.max(0, performance.now() - userActionAt),
      wavExportMs: decodedResult.metrics.decodeMs,
    });
    renderWithoutRebuildingList(dom);

    debugLog('decode-and-play', {
      track: track.label,
      runtimeState: runtime.getState(),
      decodedResult,
    });
  } catch (error) {
    controller.setRuntimeStatus('error');
    renderWithoutRebuildingList(dom);
    console.error('[wasm-demo] decode failed', {
      track: track.label,
      error,
      runtimeState: runtime.getState(),
    });
  }
}

function resetRuntimeMetrics() {
  controller.updateMetrics({
    wasmFetchMs: null,
    wasmInstantiateMs: null,
    userActionToDecodeStartMs: null,
    decodeMs: null,
    userActionToPlaybackStartMs: null,
    wavExportMs: null,
    fileSizeBytes: null,
    wavSizeBytes: null,
    cacheHit: false,
  });
}

async function addPickedFiles(dom, files) {
  if (!files.length) {
    return;
  }

  controller.appendFolderEntries(files);
  controller.setRuntimeStatus('ready');
  render(dom);
  debugLog('playlist-appended', {
    count: files.length,
    labels: files.map((file) => file.webkitRelativePath || file.name),
  });
}

async function openFiles(dom) {
  if (supportsPickerApi()) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
          description: 'Wwise audio streams',
          accept: {
            'application/octet-stream': ['.wem'],
          },
        }],
      });
      const files = handles.map((handle) => createLazyLocalFile({
        name: handle.name,
        label: handle.name,
        getFile: () => handle.getFile(),
      }));
      await addPickedFiles(dom, files);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('[wasm-demo] file picker failed', error);
      }
    }
    return;
  }

  dom.singleFileInput.click();
}

async function openFolder(dom) {
  if (supportsPickerApi()) {
    try {
      const directoryHandle = await window.showDirectoryPicker();
      const files = await walkDirectoryHandles(directoryHandle);
      await addPickedFiles(dom, files);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('[wasm-demo] directory picker failed', error);
      }
    }
    return;
  }

  dom.folderInput.click();
}

function installEventHandlers(dom) {
  dom.audioPlayer.volume = 0.2;
  dom.pickerHint.textContent = supportsPickerApi()
    ? 'Chromium file pickers are used here. Files stay local and are only read when you click a playlist entry.'
    : 'Browser file pickers are unavailable here, so hidden file inputs are used as a fallback.';

  dom.openFileButton.addEventListener('click', () => {
    void openFiles(dom);
  });

  dom.openFolderButton.addEventListener('click', () => {
    void openFolder(dom);
  });

  dom.reloadButton.addEventListener('click', async () => {
    revokeDecodedResult(controller.getState().decodedResult);
    dom.audioPlayer.pause();
    dom.audioPlayer.removeAttribute('src');
    dom.audioPlayer.load();
    await runtime.reload();
    controller.setRuntimeStatus('idle');
    resetRuntimeMetrics();
    render(dom);
    debugLog('runtime-reloaded', runtime.getState());
  });

  dom.downloadButton.addEventListener('click', downloadCurrentTrack);

  dom.singleFileInput.addEventListener('change', async () => {
    const files = Array.from(dom.singleFileInput.files ?? []);
    dom.singleFileInput.value = '';
    if (!files.length) {
      return;
    }
    await addPickedFiles(dom, files);
  });

  dom.folderInput.addEventListener('change', async () => {
    const files = Array.from(dom.folderInput.files ?? []);
    dom.folderInput.value = '';
    await addPickedFiles(dom, files);
  });

  dom.trackList.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-track-id]');
    if (!item) {
      return;
    }

    const track = controller.getTrackById(item.dataset.trackId);
    controller.selectTrack(item.dataset.trackId);
    await ensureTrackFileMetadata(track);
    renderWithoutRebuildingList(dom);
    debugLog('track-selected', {
      track: track?.label,
    });
    await decodeAndPlay(dom, track, performance.now());
  });

  dom.audioPlayer.addEventListener('timeupdate', () => renderPlaybackTime(dom));
  dom.audioPlayer.addEventListener('loadedmetadata', () => renderPlaybackTime(dom));
  dom.audioPlayer.addEventListener('pause', () => {
    if (controller.getState().runtimeStatus === 'playing') {
      controller.setRuntimeStatus('ready');
      render(dom);
    }
  });
}

function bootDemo() {
  const dom = collectDom();
  resetRuntimeMetrics();
  render(dom);
  installEventHandlers(dom);
}

bootDemo();
