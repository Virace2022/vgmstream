import test from 'node:test';
import assert from 'node:assert/strict';

const controllerModuleUrl = new URL('../pages/assets/player-controller.mjs', import.meta.url);

async function loadControllerModule() {
  return import(`${controllerModuleUrl.href}?cacheBust=${Date.now()}-${Math.random()}`);
}

test('folder loading keeps only .wem files in sorted order', async () => {
  const { createPlayerController } = await loadControllerModule();
  const controller = createPlayerController();

  controller.loadFolderEntries([
    { name: 'zeta.txt', webkitRelativePath: 'Z/zeta.txt' },
    { name: 'b.wem', webkitRelativePath: 'vo/b.wem' },
    { name: 'A.WEM', webkitRelativePath: 'sfx/A.WEM' },
    { name: 'middle.bin', webkitRelativePath: 'tmp/middle.bin' },
  ]);

  assert.deepEqual(
    controller.getState().tracks.map((track) => track.label),
    ['sfx/A.WEM', 'vo/b.wem'],
  );
});

test('appending files keeps the existing playlist and current track', async () => {
  const { createPlayerController } = await loadControllerModule();
  const controller = createPlayerController();

  controller.loadSingleFile({ name: 'first.wem' });
  const firstTrack = controller.getState().tracks[0];
  controller.activateTrack(firstTrack.id);

  controller.appendFolderEntries([
    { name: 'third.wem', webkitRelativePath: 'beta/third.wem' },
    { name: 'second.wem', webkitRelativePath: 'alpha/second.wem' },
    { name: 'ignore.txt', webkitRelativePath: 'alpha/ignore.txt' },
  ]);

  const state = controller.getState();
  assert.deepEqual(
    state.tracks.map((track) => track.label),
    ['alpha/second.wem', 'beta/third.wem', 'first.wem'],
  );
  assert.equal(state.currentTrackId, firstTrack.id);
});

test('select and activate update the current track state', async () => {
  const { createPlayerController } = await loadControllerModule();
  const controller = createPlayerController();

  controller.loadFolderEntries([
    { name: 'first.wem', webkitRelativePath: 'alpha/first.wem' },
    { name: 'second.wem', webkitRelativePath: 'beta/second.wem' },
  ]);

  const [firstTrack, secondTrack] = controller.getState().tracks;

  controller.selectTrack(secondTrack.id);
  assert.equal(controller.getState().selectedTrackId, secondTrack.id);
  assert.equal(controller.getState().currentTrackId, null);

  controller.activateTrack(secondTrack.id);
  assert.equal(controller.getState().currentTrackId, secondTrack.id);

  controller.activateTrack(firstTrack.id);
  assert.equal(controller.getState().currentTrackId, firstTrack.id);
});

test('focused track follows selection even before activation', async () => {
  const { createPlayerController } = await loadControllerModule();
  const controller = createPlayerController();

  controller.loadFolderEntries([
    { name: 'first.wem', webkitRelativePath: 'alpha/first.wem' },
    { name: 'second.wem', webkitRelativePath: 'beta/second.wem' },
  ]);

  const [firstTrack, secondTrack] = controller.getState().tracks;

  controller.activateTrack(firstTrack.id);
  assert.equal(controller.getFocusedTrack().id, firstTrack.id);

  controller.selectTrack(secondTrack.id);
  assert.equal(controller.getFocusedTrack().id, secondTrack.id);
  assert.equal(controller.getState().currentTrackId, firstTrack.id);
});

test('download becomes available only after a decoded result is attached', async () => {
  const { createPlayerController } = await loadControllerModule();
  const controller = createPlayerController();

  controller.loadSingleFile({ name: 'single.wem' });
  const [track] = controller.getState().tracks;

  assert.equal(controller.getState().downloadReady, false);

  controller.activateTrack(track.id);
  controller.setDecodedResult({
    trackId: track.id,
    objectUrl: 'blob:demo',
    wavBytes: new Uint8Array([1, 2, 3]),
  });

  assert.equal(controller.getState().downloadReady, true);
  assert.equal(controller.getState().decodedTrackId, track.id);
});

test('page metrics merge without touching unrelated fields', async () => {
  const { createPlayerController } = await loadControllerModule();
  const controller = createPlayerController();

  controller.updateMetrics({
    wasmFetchMs: 15,
    fileSizeBytes: 1024,
  });
  controller.updateMetrics({
    decodeMs: 48,
  });

  assert.deepEqual(controller.getState().metrics, {
    wasmFetchMs: 15,
    wasmInstantiateMs: null,
    userActionToDecodeStartMs: null,
    decodeMs: 48,
    userActionToPlaybackStartMs: null,
    wavExportMs: null,
    fileSizeBytes: 1024,
    wavSizeBytes: null,
    cacheHit: false,
  });
});
