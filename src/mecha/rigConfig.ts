import { JOINTS } from "./types";
export const modelPaths = {
  prepared: `${import.meta.env.BASE_URL}assets/models/mecha-right-arm.glb?v=continuous-arm-2`,
  original: `${import.meta.env.BASE_URL}assets/models/mecha-original.glb`,
};
export const rigConfig = {
  joints: Object.fromEntries(JOINTS.map((j) => [j, j])),
  sockets: { rightHand: "rightHand", leftHand: "leftHand", back: "back" },
  partNames: ["body", "upperArm", "forearm", "hand", "rifle", "shield"],
  limits: { shoulder: [0, 55], elbow: [0, 85], wrist: [-20, 20] } as const,
};
