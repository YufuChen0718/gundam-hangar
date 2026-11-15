import type { JointAngles, ModelMode } from "../mecha/types";
import { zeroJointAngles } from "../mecha/rigConfig";

export interface HangarState {
  ready: boolean;
  error: string | null;
  mode: ModelMode;
  angles: JointAngles;
  weapon: boolean;
  shield: boolean;
  wireframe: boolean;
  parts: boolean;
  joints: boolean;
  time: number;
  playing: boolean;
  modelYawDeg: number;
  loading: boolean;
}

export function createStore() {
  let state: HangarState = {
    ready: false,
    error: null,
    mode: "prepared",
    angles: zeroJointAngles(),
    weapon: true,
    shield: true,
    wireframe: false,
    parts: false,
    joints: false,
    time: 0,
    playing: false,
    modelYawDeg: 0,
    loading: false,
  };
  const listeners = new Set<(s: HangarState) => void>();
  return {
    get: () => state,
    set: (patch: Partial<HangarState>) => {
      state = { ...state, ...patch };
      listeners.forEach((f) => f(state));
    },
    subscribe: (fn: (s: HangarState) => void) => {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
