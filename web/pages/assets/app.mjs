import { createPlayerController } from './player-controller.mjs';
import { applyTextTranslations, createLocaleController, getPreferredLocale } from './i18n.mjs';
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
const uiTranslations = {
  'zh-CN': {
    __title: 'vgmstream wasm-min 演示站',
    'toolbar.openFile': '添加文件',
    'toolbar.openFolder': '添加文件夹',
    'toolbar.reloadWasm': '重新加载 WASM',
    'toolbar.downloadWav': '下载 WAV',
    'track.heading': '文件列表',
    'track.description': '添加文件夹只会更新本地播放列表。点击某个 <code>.wem</code> 条目即可立即解码并播放。',
    'player.heading': '播放器',
    'player.description': '点击左侧条目后，右侧面板会立即刷新，并开始解码与播放。',
    'meta.file': '源文件',
    'meta.wav': 'WAV 输出',
    'meta.rate': '采样率',
    'meta.channels': '声道数',
    'meta.duration': '时长',
    'metrics.heading': '调试指标',
    'metrics.wasmFetch': 'WASM 下载',
    'metrics.wasmInit': 'WASM 初始化',
    'metrics.decodeStart': '开始解码',
    'metrics.decodeDone': '解码完成',
    'metrics.playbackStart': '开始播放',
    'metrics.wavExport': 'WAV 导出',
    'metrics.inputBytes': '输入大小',
    'metrics.wavBytes': 'WAV 大小',
    'docs.web': '原生 Web 指南',
    'docs.react': 'React 指南',
    'docs.vue': 'Vue 指南',
    'docs.github': 'GitHub 仓库',
    'status.label': '状态',
    'status.idle': '空闲',
    'status.ready': '就绪',
    'status.decoding': '解码中',
    'status.playing': '播放中',
    'status.error': '错误',
    'picker.hint.native': '当前环境支持 Chromium 文件选择器。文件始终保留在本地，只有点击播放列表条目时才会读取。',
    'picker.hint.fallback': '当前环境不支持 File System Access API，已回退为隐藏文件输入框。',
    'picker.typeDescription': 'Wwise 音频流',
    'current.none': '未选择音频',
    'track.empty': '添加 .wem 文件或文件夹后，这里会显示本地播放列表。',
  },
  en: {
    __title: 'vgmstream wasm-min demo',
    'toolbar.openFile': 'Add File',
    'toolbar.openFolder': 'Add Folder',
    'toolbar.reloadWasm': 'Reload WASM',
    'toolbar.downloadWav': 'Download WAV',
    'track.heading': 'Files',
    'track.description': 'Adding a folder only updates the local playlist. Click a <code>.wem</code> entry to decode and play it.',
    'player.heading': 'Player',
    'player.description': 'Clicking a row updates the right panel and immediately starts decode and playback.',
    'meta.file': 'File',
    'meta.wav': 'WAV',
    'meta.rate': 'Rate',
    'meta.channels': 'Channels',
    'meta.duration': 'Duration',
    'metrics.heading': 'Debug Metrics',
    'metrics.wasmFetch': 'wasm download',
    'metrics.wasmInit': 'wasm init',
    'metrics.decodeStart': 'decode start',
    'metrics.decodeDone': 'decode done',
    'metrics.playbackStart': 'playback start',
    'metrics.wavExport': 'wav export',
    'metrics.inputBytes': 'input bytes',
    'metrics.wavBytes': 'wav bytes',
    'docs.web': 'Plain Web Guide',
    'docs.react': 'React Guide',
    'docs.vue': 'Vue Guide',
    'docs.github': 'GitHub Repository',
    'status.label': 'Status',
    'status.idle': 'idle',
    'status.ready': 'ready',
    'status.decoding': 'decoding',
    'status.playing': 'playing',
    'status.error': 'error',
    'picker.hint.native': 'Chromium file pickers are used here. Files stay local and are only read when you click a playlist entry.',
    'picker.hint.fallback': 'Browser file pickers are unavailable here, so hidden file inputs are used as a fallback.',
    'picker.typeDescription': 'Wwise audio streams',
    'current.none': 'No track selected',
    'track.empty': 'Add a .wem file or folder to build a local playlist.',
  },
};
let activeLocale = getPreferredLocale();

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

function t(key) {
  return uiTranslations[activeLocale]?.[key] ?? uiTranslations['zh-CN'][key] ?? key;
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
    empty.textContent = t('track.empty');
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

function renderPickerHint(dom) {
  dom.pickerHint.textContent = supportsPickerApi()
    ? t('picker.hint.native')
    : t('picker.hint.fallback');
}

function renderDetails(dom) {
  const state = controller.getState();
  const focusedTrack = controller.getFocusedTrack();
  const info = state.decodedTrackId && focusedTrack && state.decodedTrackId === focusedTrack.id
    ? state.decodedResult?.infoJson ?? null
    : null;

  dom.runtimeStatus.textContent = `${t('status.label')}: ${t(`status.${state.runtimeStatus}`)}`;
  dom.currentTrackLabel.textContent = focusedTrack ? focusedTrack.label : t('current.none');
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
  applyTextTranslations(activeLocale, uiTranslations);
  renderPickerHint(dom);
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
          description: t('picker.typeDescription'),
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
  createLocaleController({
    onChange(locale) {
      activeLocale = locale;
      render(dom);
    },
  });
  resetRuntimeMetrics();
  render(dom);
  installEventHandlers(dom);
}

bootDemo();
