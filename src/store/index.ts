import { dataEdits, type StoreCore } from './edits';
import { productEdits } from './productEdits';
import { useState, useEffect, useEffectEvent, useRef, useMemo } from 'react';
import { oldShoppingLineIds } from '../shopList';
import { setCurrentProducts } from '../shopping/current';
import { AppState } from '../types';
import { formatDateISO } from '../utils';
import { useDeviceIdentity } from '../hooks/useDeviceIdentity';
import {
  getGistConfig,
  saveGistConfig,
  clearGistConfig,
  fetchGist,
  saveGist,
  createPrivateGist,
  getGistOwner,
  saveGistOwner,
  GistConfig,
} from '../services/gistStorage';
import { calendarFeedFiles, calendarFeedMissing } from '../calendarReminders';
import {
  mergeAppStates,
  applyLocalChange,
  statesEqual,
  getDismissedShoppingIds,
  dropDefaultsMissingFrom,
  keepOnlyChangesSince,
  LONG_ABSENCE_MS,
} from '../services/syncMerge';
import { CATALOG_VERSION, upgradeProductDefaults, normaliseProducts } from '../shopping';
import { messageOf } from '../errors';
import {
  DEFAULT_PREFERENCES,
  FAST_SYNC_SECONDS,
  LS_PENDING,
  PUSH_DELAY_MS,
  SYNC_POLL_SECONDS,
  getInitialState,
  normalizeState,
  persistLocal,
  readLastSyncOk,
  writeLastSyncOk,
} from './saved';

const friendlyError = (err: unknown, fallback: string) => (err ? messageOf(err) : undefined) || fallback;

/** Everything the screens get from the store: the data, and the ways to change it. */
export type AppStore = ReturnType<typeof useStore>;

export function useStore() {
  const [state, setStateRaw] = useState<AppState>(() => {
    const s = getInitialState();
    setCurrentProducts(s.groceryDatabase, s.groceryOverrides);
    return s;
  });
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const currentUser = useDeviceIdentity();

  // GitHub Sync States
  const [githubConfig, setGithubConfigState] = useState<GistConfig | null>(getGistConfig);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>(() =>
    getGistConfig() ? 'loading' : 'idle',
  );
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  // Shopping mode asks for quicker checks, so two people shopping see each other's ticks.
  const [fastSync, setFastSync] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  /** Something worth saying about the last sync (e.g. this phone had been away a long time). */
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  /** The GitHub account the sync Gist belongs to (for the calendar feed's address). */
  const [gistOwner, setGistOwnerState] = useState<string | null>(getGistOwner);
  const gistOwnerRef = useRef<string | null>(gistOwner);
  const noteOwner = (owner: string | null | undefined) => {
    if (!owner || owner === gistOwnerRef.current) return;
    gistOwnerRef.current = owner;
    saveGistOwner(owner);
    setGistOwnerState(owner);
  };

  // ---- Sync engine (refs so background work always sees the latest data) ----
  const stateRef = useRef<AppState>(state);
  const etagRef = useRef<string | null>(null);
  const gistFilesRef = useRef<string[]>([]);
  const editCountRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const rerunRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<boolean>(
    (() => {
      try {
        return localStorage.getItem(LS_PENDING) === '1';
      } catch {
        return false;
      }
    })(),
  );

  const setPending = (value: boolean) => {
    pendingRef.current = value;
    try {
      localStorage.setItem(LS_PENDING, value ? '1' : '0');
    } catch {
      /* storage full or blocked: still remembered while the app is open */
    }
  };

  /** Replace the data on this phone (screen + local storage). */
  // True when the last save on this phone failed (storage full): the app shows a warning.
  const [saveProblem, setSaveProblem] = useState(false);
  const replaceState = (next: AppState) => {
    stateRef.current = next;
    setCurrentProducts(next.groceryDatabase, next.groceryOverrides);
    setStateRaw(next);
    const ok = persistLocal(next);
    setSaveProblem((was) => (was === !ok ? was : !ok));
  };

  const schedulePush = (delay = PUSH_DELAY_MS) => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      void runSync('push');
    }, delay);
  };

  /**
   * Save an edit. `base` is the data the screen showed when the edit was made
   * and `next` is the edited version; only the difference is applied on top of
   * the latest data, so edits never undo changes downloaded in the meantime.
   */
  const commit = (base: AppState, next: AppState) => {
    const applied = applyLocalChange(stateRef.current, base, next, Date.now());
    replaceState(applied);
    editCountRef.current++;
    if (getGistConfig()) {
      setPending(true);
      schedulePush();
    }
  };

  /**
   * One sync round: download the Gist if it changed, merge it in, and upload
   * if this phone has anything the Gist doesn't.
   */
  const runSync = (reason: 'initial' | 'poll' | 'focus' | 'push' | 'manual'): Promise<void> => {
    const config = getGistConfig();
    if (!config) return Promise.resolve();
    if (inFlightRef.current) {
      rerunRef.current = true;
      return inFlightRef.current;
    }
    const quiet = reason === 'poll' || reason === 'focus';

    const task = (async () => {
      if (!quiet) setSyncStatus('loading');
      try {
        const result = await fetchGist(config, etagRef.current);
        let remote: AppState | null = null;
        let gistIsEmpty = false;
        if (!result.notModified) {
          etagRef.current = result.snapshot.etag;
          gistFilesRef.current = result.snapshot.files;
          noteOwner(result.snapshot.owner);
          remote = result.snapshot.state;
          gistIsEmpty = remote === null;
        }

        let merged = stateRef.current;
        if (remote) {
          // Away longer than deletions are remembered: start from the shared copy and add only what
          // was changed on this phone since it last synced, so things deleted meanwhile stay deleted.
          const lastOk = readLastSyncOk();
          const away = lastOk !== null && Date.now() - lastOk > LONG_ABSENCE_MS;
          const local = away
            ? keepOnlyChangesSince(stateRef.current, lastOk!)
            : dropDefaultsMissingFrom(stateRef.current, remote);
          merged = mergeAppStates(local, remote);
          if (away)
            setSyncNotice(
              "This phone hadn't synced for over 3 months, so it took the shared copy and kept only the changes made on it since.",
            );
          if (!statesEqual(merged, stateRef.current)) {
            replaceState(normalizeState(merged));
            merged = stateRef.current;
          }
        }
        // Keep the product list in one piece (folds in anything an older version of the app wrote).
        const tidied = normaliseProducts(stateRef.current, Date.now());
        if (tidied !== stateRef.current) {
          replaceState(normalizeState(tidied));
          merged = stateRef.current;
          setPending(true);
        }
        // Newer built-in product defaults (UK pack sizes, names), once per version, on the latest data.
        if (upgradeProductsIfDue()) merged = stateRef.current;

        const gistIsBehind = remote ? !statesEqual(merged, remote) : false;
        const feedMissing = calendarFeedMissing(stateRef.current, gistFilesRef.current);
        const willUpload = pendingRef.current || gistIsBehind || gistIsEmpty || feedMissing;
        if (willUpload) {
          if (quiet) setSyncStatus('loading');
          const editsBefore = editCountRef.current;
          const saved = await saveGist(
            config,
            stateRef.current,
            gistFilesRef.current,
            calendarFeedFiles(stateRef.current, gistFilesRef.current, new Date()),
          );
          etagRef.current = saved.etag;
          noteOwner(saved.owner);
          if (saved.files.length) gistFilesRef.current = saved.files;
          if (editCountRef.current === editsBefore) {
            setPending(false);
          } else {
            rerunRef.current = true; // more edits arrived during upload
          }
        }

        writeLastSyncOk(Date.now());
        setSyncStatus('synced');
        setSyncError(null);
        // Quiet checks that found nothing new don't need to refresh the screen.
        if (!quiet || remote || willUpload) setLastSynced(new Date());
      } catch (err) {
        console.error(`Gist sync (${reason}) failed:`, err);
        setSyncStatus('error');
        setSyncError(friendlyError(err, 'Failed to sync with GitHub Gist.'));
      }
    })();

    inFlightRef.current = task;
    return task.finally(() => {
      inFlightRef.current = null;
      if (rerunRef.current) {
        rerunRef.current = false;
        schedulePush(200);
      }
    });
  };

  // Shopping lines from weeks long gone are cleared (through the normal save, so the other phone
  // clears them too): once, shortly after opening, when the first sync has had its chance.
  const clearOldLines = useEffectEvent(() => {
    const cur = stateRef.current;
    const old = new Set(oldShoppingLineIds(cur.shoppingList || [], formatDateISO(new Date())));
    if (old.size) commit(cur, { ...cur, shoppingList: cur.shoppingList.filter((i) => !old.has(i.id)) });
  });
  useEffect(() => {
    const t = setTimeout(() => clearOldLines(), getGistConfig() ? 15000 : 1500);
    return () => clearTimeout(t);
  }, []);

  // Background sync: on open, every SYNC_POLL_SECONDS while visible, on return to the app, and when
  // back online. Started again only when the Gist, the key or the pace (shopping mode) changes;
  // each round runs with everything as it is at that moment.
  const syncGistId = githubConfig?.gistId;
  const syncPat = githubConfig?.pat;
  const syncNow = useEffectEvent((reason: 'initial' | 'poll' | 'focus') => void runSync(reason));
  useEffect(() => {
    if (!syncGistId || !syncPat) return;
    syncNow('initial');
    const interval = setInterval(
      () => {
        if (document.visibilityState === 'visible') syncNow('poll');
      },
      (fastSync ? FAST_SYNC_SECONDS : SYNC_POLL_SECONDS) * 1000,
    );
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow('focus');
    };
    const onOnline = () => syncNow('focus');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [syncGistId, syncPat, fastSync]);

  /** Newer built-in product defaults, applied once per catalogue version. True if it did anything. */
  const upgradeProductsIfDue = (): boolean => {
    const current = stateRef.current;
    if ((current.preferences?.catalogVersion ?? 1) >= CATALOG_VERSION) return false;
    commit(current, upgradeProductDefaults(current, DEFAULT_PREFERENCES));
    return true;
  };

  // Phones that don't sync: keep the product list in one piece and up to date, once on open
  // (syncing phones do it after each sync, so it works on the latest shared data).
  const tidyProductsOnOpen = useEffectEvent(() => {
    if (getGistConfig()) return;
    const current = stateRef.current;
    const tidied = normaliseProducts(current, Date.now());
    if (tidied !== current) replaceState(normalizeState(tidied));
    upgradeProductsIfDue();
  });
  useEffect(() => {
    tidyProductsOnOpen();
  }, []);

  // Shopping items that either of you removed, so they aren't regenerated automatically.
  const dismissedKey = getDismissedShoppingIds(state).join('|');
  const dismissedShoppingItemIds = useMemo(() => (dismissedKey ? dismissedKey.split('|') : []), [dismissedKey]);

  // The ways to change the data (edits.ts, productEdits.ts): each works out a change and saves it here.
  const core: StoreCore = { state, latest: () => stateRef.current, commit, currentUser };
  const edits = dataEdits(core);
  const productAndSettingEdits = productEdits(core);

  // GitHub Config Management
  const saveGithubConfig = async (pat: string, gistId: string, syncMode: 'pull' | 'push' | 'merge') => {
    const config = { pat: pat.trim(), gistId: gistId.trim() };
    setSyncStatus('loading');
    setSyncError(null);
    try {
      const result = await fetchGist(config, null);
      const snapshot = result.notModified ? null : result.snapshot;
      const remoteState = snapshot?.state || null;
      etagRef.current = snapshot?.etag || null;
      gistFilesRef.current = snapshot?.files || [];
      noteOwner(snapshot?.owner);
      saveGistConfig(config.pat, config.gistId);

      if (syncMode === 'pull') {
        if (remoteState) {
          replaceState(normalizeState(remoteState));
        }
      } else if (syncMode === 'push') {
        const saved = await saveGist(
          config,
          stateRef.current,
          gistFilesRef.current,
          calendarFeedFiles(stateRef.current, gistFilesRef.current, new Date()),
        );
        etagRef.current = saved.etag;
        gistFilesRef.current = saved.files;
        noteOwner(saved.owner);
      } else if (syncMode === 'merge') {
        if (remoteState) {
          replaceState(
            normalizeState(mergeAppStates(dropDefaultsMissingFrom(stateRef.current, remoteState), remoteState)),
          );
        }
        const saved = await saveGist(
          config,
          stateRef.current,
          gistFilesRef.current,
          calendarFeedFiles(stateRef.current, gistFilesRef.current, new Date()),
        );
        etagRef.current = saved.etag;
        gistFilesRef.current = saved.files;
        noteOwner(saved.owner);
      }
      setPending(false);
      writeLastSyncOk(Date.now());
      setGithubConfigState(config);
      setSyncStatus('synced');
      setLastSynced(new Date());
    } catch (err) {
      console.error('Failed to configure Gist integration:', err);
      setSyncStatus('error');
      setSyncError(friendlyError(err, 'Failed to configure GitHub Gist.'));
      throw err;
    }
  };

  const createGistFromLocal = async (pat: string): Promise<string> => {
    setSyncStatus('loading');
    setSyncError(null);
    try {
      const created = await createPrivateGist(pat.trim(), stateRef.current);
      etagRef.current = created.etag;
      gistFilesRef.current = created.files;
      noteOwner(created.owner);
      saveGistConfig(pat, created.id);
      setPending(false);
      writeLastSyncOk(Date.now());
      setGithubConfigState({ pat: pat.trim(), gistId: created.id });
      setSyncStatus('synced');
      setLastSynced(new Date());
      return created.id;
    } catch (err) {
      console.error('Failed to create private Gist:', err);
      setSyncStatus('error');
      setSyncError(friendlyError(err, 'Failed to create a private GitHub Gist.'));
      throw err;
    }
  };

  const clearGithubConfig = () => {
    clearGistConfig();
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    etagRef.current = null;
    gistFilesRef.current = [];
    gistOwnerRef.current = null;
    setGistOwnerState(null);
    setPending(false);
    setGithubConfigState(null);
    setSyncStatus('idle');
    setLastSynced(null);
    setSyncError(null);
  };

  const manualSync = async () => {
    await runSync('manual');
  };

  return {
    state,
    /** The last save on this phone failed (storage full). */
    saveProblem,
    /** The very latest state, including edits made earlier in the same tap (state is a render behind). */
    getState: () => stateRef.current,
    selectedPlanId,
    setSelectedPlanId,
    ...edits,
    ...productAndSettingEdits,
    dismissedShoppingItemIds,
    // GitHub Gist exports
    githubConfig,
    /** The GitHub account the sync Gist belongs to, once a sync has seen it. */
    gistOwner,
    syncStatus,
    lastSynced,
    syncError,
    syncNotice,
    clearSyncNotice: () => setSyncNotice(null),
    syncPollSeconds: fastSync ? FAST_SYNC_SECONDS : SYNC_POLL_SECONDS,
    setFastSync,
    /** Who is using this phone ('P' or 'R'). */
    currentUser,
    saveGithubConfig,
    createGistFromLocal,
    clearGithubConfig,
    manualSync,
  };
}
