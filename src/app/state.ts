import type {
  JointAngles,
  ModelMode,
  RightHandItem,
  SkinningMode,
} from "../mecha/types";
import type {
  ActionName,
  AnimatorStatus,
  TransitionMode,
} from "../animation/clips";
import { zeroJointAngles } from "../mecha/rigConfig";

export interface HangarState {
  ready: boolean;
  error: string | null;
  mode: ModelMode;
  skinning: SkinningMode;
  action: ActionName;
  status: AnimatorStatus;
  transitionMode: TransitionMode;
  angles: JointAngles;
  rightHandItem: RightHandItem;
  saberBlade: boolean;
  weapon: boolean;
  shield: boolean;
  loadoutCollapsed: boolean;
  wireframe: boolean;
  parts: boolean;
  joints: boolean;
  time: number;
  duration: number;
  playing: boolean;
  modelYawDeg: number;
  loading: boolean;
}

export function createStore() {
  let state: HangarState = {
    ready: false,
    error: null,
    mode: "sentinel",
    skinning: "rigid",
    action: "idle",
    status: "holding",
    transitionMode: "blend",
    angles: zeroJointAngles(),
    rightHandItem: "rifle",
    saberBlade: true,
    weapon: true,
    shield: true,
    loadoutCollapsed: false,
    wireframe: false,
    parts: false,
    joints: false,
    time: 0,
    duration: 6,
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
