import { useCallback, useEffect, useRef, useState } from 'react';
import type { Shift, TeacherFixedTaMap, UserConfigSnapshot } from '../types';
import type { TeachingAssistant } from '../data/teachingAssistants';
import type { SlotOverrides } from '../utils/slotAccess';
import type { RegistrationGrid } from '../utils/registrationUtils';
import {
  clearSession,
  fetchCurrentUser,
  fetchUserConfig,
  getStoredSession,
  login as apiLogin,
  logout as apiLogout,
  saveUserConfig,
  type AuthSession,
} from '../api/userConfigApi';

export type SyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

export interface ConfigState {
  weekStart: string;
  shifts: Shift[];
  roster: TeachingAssistant[];
  registrationGrid: RegistrationGrid;
  slotOverrides?: SlotOverrides;
  classColors: Record<string, string>;
  fixedTaMap: TeacherFixedTaMap;
}

export interface ConfigSetters {
  setWeekStart: (value: string) => void;
  setShifts: (value: Shift[] | ((prev: Shift[]) => Shift[])) => void;
  setRoster: (value: TeachingAssistant[] | ((prev: TeachingAssistant[]) => TeachingAssistant[])) => void;
  setRegistrationGrid: (value: RegistrationGrid | ((prev: RegistrationGrid) => RegistrationGrid)) => void;
  setSlotOverrides: (value: SlotOverrides | undefined) => void;
  setClassColors: (value: Record<string, string>) => void;
  setFixedTaMap: (value: TeacherFixedTaMap) => void;
}

function readSheetsSettings() {
  try {
    const webhookRaw = localStorage.getItem('lich-sheets-webhook');
    const autoPushRaw = localStorage.getItem('lich-sheets-auto-push');
    return {
      sheetsWebhook: webhookRaw ? (JSON.parse(webhookRaw) as string) : '',
      sheetsAutoPush: autoPushRaw ? (JSON.parse(autoPushRaw) as boolean) : false,
    };
  } catch {
    return { sheetsWebhook: '', sheetsAutoPush: false };
  }
}

function applySheetsSettings(sheetsWebhook: string, sheetsAutoPush: boolean) {
  localStorage.setItem('lich-sheets-webhook', JSON.stringify(sheetsWebhook));
  localStorage.setItem('lich-sheets-auto-push', JSON.stringify(sheetsAutoPush));
}

function buildSnapshot(state: ConfigState): UserConfigSnapshot {
  const sheets = readSheetsSettings();
  return {
    ...state,
    ...sheets,
  };
}

function applySnapshot(config: UserConfigSnapshot, setters: ConfigSetters) {
  setters.setWeekStart(config.weekStart);
  setters.setShifts(config.shifts);
  setters.setRoster(config.roster);
  setters.setRegistrationGrid(config.registrationGrid);
  setters.setSlotOverrides(config.slotOverrides);
  setters.setClassColors(config.classColors ?? {});
  setters.setFixedTaMap(config.fixedTaMap ?? {});
  applySheetsSettings(config.sheetsWebhook ?? '', Boolean(config.sheetsAutoPush));
}

export function useUserConfigSync(state: ConfigState, setters: ConfigSetters) {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(false);
  const stateRef = useRef(state);

  stateRef.current = state;

  const restoreSession = useCallback(
    async (nextSession: AuthSession) => {
      setSyncStatus('loading');
      setSyncError(null);
      try {
        await fetchCurrentUser(nextSession.token);
        const config = await fetchUserConfig(nextSession.token);
        if (config) {
          skipNextSave.current = true;
          applySnapshot(config, setters);
          setLastSavedAt(config.updatedAt ?? null);
        }
        setSession(nextSession);
        setSyncStatus('saved');
      } catch (err) {
        clearSession();
        setSession(null);
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : 'Không thể tải cấu hình');
      }
    },
    [setters],
  );

  useEffect(() => {
    const stored = getStoredSession();
    if (stored) {
      void restoreSession(stored);
    }
  }, [restoreSession]);

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      setSyncStatus('loading');
      setSyncError(null);
      try {
        const nextSession = await apiLogin(username, password);
        await restoreSession(nextSession);
      } catch (err) {
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
        throw err;
      }
    },
    [restoreSession],
  );

  const handleLogout = useCallback(async () => {
    if (session?.token) {
      await apiLogout(session.token);
    } else {
      clearSession();
    }
    setSession(null);
    setSyncStatus('idle');
    setSyncError(null);
    setLastSavedAt(null);
  }, [session]);

  useEffect(() => {
    if (!session?.token) return;

    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      setSyncStatus('saving');
      setSyncError(null);
      try {
        const snapshot = buildSnapshot(stateRef.current);
        await saveUserConfig(session.token, snapshot);
        setLastSavedAt(new Date().toISOString());
        setSyncStatus('saved');
      } catch (err) {
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : 'Không thể lưu cấu hình');
      }
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [session, state]);

  return {
    session,
    syncStatus,
    syncError,
    lastSavedAt,
    handleLogin,
    handleLogout,
  };
}
