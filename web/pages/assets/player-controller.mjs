function createDefaultMetrics() {
  return {
    wasmFetchMs: null,
    wasmInstantiateMs: null,
    userActionToDecodeStartMs: null,
    decodeMs: null,
    userActionToPlaybackStartMs: null,
    wavExportMs: null,
    fileSizeBytes: null,
    wavSizeBytes: null,
    cacheHit: false,
  };
}

function isPlayableWem(file) {
  return typeof file?.name === 'string' && file.name.toLowerCase().endsWith('.wem');
}

function normalizeTrackEntries(entries, nextIdRef) {
  return entries
    .filter(isPlayableWem)
    .map((file, index) => {
      const label = file.webkitRelativePath || file.name;
      return {
        id: `track-${nextIdRef.value + index}-${label}`,
        file,
        name: file.name,
        label,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
}

export function createPlayerController() {
  const nextIdRef = { value: 0 };
  const state = {
    tracks: [],
    selectedTrackId: null,
    currentTrackId: null,
    decodedTrackId: null,
    decodedResult: null,
    downloadReady: false,
    runtimeStatus: 'idle',
    metrics: createDefaultMetrics(),
  };

  function getState() {
    return {
      tracks: state.tracks.map((track) => ({ ...track })),
      selectedTrackId: state.selectedTrackId,
      currentTrackId: state.currentTrackId,
      decodedTrackId: state.decodedTrackId,
      decodedResult: state.decodedResult,
      downloadReady: state.downloadReady,
      runtimeStatus: state.runtimeStatus,
      metrics: { ...state.metrics },
    };
  }

  function resetDecodedState() {
    state.decodedTrackId = null;
    state.decodedResult = null;
    state.downloadReady = false;
  }

  function loadTracks(entries) {
    const tracks = normalizeTrackEntries(entries, nextIdRef);
    nextIdRef.value += tracks.length;
    state.tracks = tracks;
    state.selectedTrackId = state.tracks[0]?.id ?? null;
    state.currentTrackId = null;
    resetDecodedState();
    return getState();
  }

  function loadFolderEntries(entries) {
    return loadTracks(entries);
  }

  function loadSingleFile(file) {
    return loadTracks([file]);
  }

  function appendTracks(entries) {
    const appended = normalizeTrackEntries(entries, nextIdRef);
    nextIdRef.value += appended.length;
    state.tracks = [...state.tracks, ...appended]
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
    if (!state.selectedTrackId) {
      state.selectedTrackId = state.tracks[0]?.id ?? null;
    }
    return getState();
  }

  function appendFolderEntries(entries) {
    return appendTracks(entries);
  }

  function appendSingleFile(file) {
    return appendTracks([file]);
  }

  function selectTrack(trackId) {
    state.selectedTrackId = trackId;
    return getState();
  }

  function activateTrack(trackId) {
    state.selectedTrackId = trackId;
    if (state.currentTrackId !== trackId) {
      state.currentTrackId = trackId;
      if (state.decodedTrackId !== trackId) {
        resetDecodedState();
      }
    }
    return getState();
  }

  function setDecodedResult(result) {
    state.decodedTrackId = result?.trackId ?? null;
    state.decodedResult = result ?? null;
    state.downloadReady = Boolean(result?.objectUrl || result?.wavBytes);
    return getState();
  }

  function updateMetrics(patch) {
    state.metrics = {
      ...state.metrics,
      ...patch,
    };
    return getState();
  }

  function setRuntimeStatus(runtimeStatus) {
    state.runtimeStatus = runtimeStatus;
    return getState();
  }

  function getTrackById(trackId) {
    return state.tracks.find((track) => track.id === trackId) ?? null;
  }

  function getFocusedTrack() {
    return getTrackById(state.selectedTrackId) ?? getTrackById(state.currentTrackId);
  }

  return {
    loadFolderEntries,
    loadSingleFile,
    appendFolderEntries,
    appendSingleFile,
    selectTrack,
    activateTrack,
    setDecodedResult,
    updateMetrics,
    setRuntimeStatus,
    getTrackById,
    getFocusedTrack,
    getState,
  };
}
