import { create } from 'zustand';
import { api } from '../api/client';
import { API_ROUTES } from '../utils/constants';
import type { SystemInfo, RebootSchedule } from '../types/api';

interface TemperatureHistoryPoint {
  time: string;
  cpuM?: number;  // temp_cpum - CPU main
  cpuB?: number;  // temp_cpub - CPU box
  sw?: number;    // temp_sw - Switch
}

interface SystemState {
  info: SystemInfo | null;
  schedule: RebootSchedule | null;
  temperatureHistory: TemperatureHistoryPoint[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSystemInfo: () => Promise<void>;
  fetchSchedule: () => Promise<void>;
  updateSchedule: (schedule: Partial<RebootSchedule>) => Promise<boolean>;
  reboot: () => Promise<boolean>;
}

export const useSystemStore = create<SystemState>((set, get) => ({
  info: null,
  schedule: null,
  temperatureHistory: [],
  isLoading: false,
  error: null,

  fetchSystemInfo: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<SystemInfo>(API_ROUTES.SYSTEM);
      if (response.success && response.result) {
        const info = response.result;
        const { temperatureHistory } = get();

        // Build temperature history from real-time data
        // All Freebox models (Ultra v9, Pop v8, Delta v7, Revolution v6) use the same temperature fields
        const newPoint: TemperatureHistoryPoint = {
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          cpuM: info.temp_cpum,  // CPU main temperature
          cpuB: info.temp_cpub,  // CPU box temperature
          sw: info.temp_sw       // Switch temperature
        };

        // Keep last 60 points (about 30 minutes at 30s polling interval)
        const newHistory = [...temperatureHistory.slice(-59), newPoint];

        set({ info, temperatureHistory: newHistory, isLoading: false });
      } else {
        set({
          isLoading: false,
          error: response.error?.message || 'Failed to fetch system info'
        });
      }
    } catch {
      set({ isLoading: false, error: 'Failed to fetch system info' });
    }
  },

  fetchSchedule: async () => {
    try {
      const response = await api.get<RebootSchedule>(API_ROUTES.SYSTEM_REBOOT_SCHEDULE);
      if (response.success && response.result) {
        set({ schedule: response.result });
      }
    } catch (error) {
      console.error('Failed to fetch schedule:', error);
    }
  },

  updateSchedule: async (schedule: Partial<RebootSchedule>) => {
    try {
      const response = await api.post<RebootSchedule>(API_ROUTES.SYSTEM_REBOOT_SCHEDULE, schedule);
      if (response.success && response.result) {
        set({ schedule: response.result });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to update schedule:', error);
      return false;
    }
  },

  reboot: async () => {
    try {
      const response = await api.post(API_ROUTES.SYSTEM_REBOOT);
      return response.success;
    } catch {
      set({ error: 'Reboot failed' });
      return false;
    }
  }
}));