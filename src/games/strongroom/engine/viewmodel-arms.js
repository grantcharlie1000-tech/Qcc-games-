// Extracted unchanged from Tiny Strike viewmodel.js (ISC; see LICENSE).
const NPC_ARM_SCALE = 0.221;
export const NPC_ARM_POSES = {
  rifle: {
    // grip = mean ak47/m4a1 = (0, -4.22, 22.57) mm, plus (+3.35, -5.36, 0) mm of
    // presentation offset (see the note above the table).
    pos: [-0.00661, -0.00731, 0.02467], rot: [-0.300, 0.524, 0], scale: NPC_ARM_SCALE,
    fallback: [0, -0.0387, 0.0284],
  },
  smg: {
    // grip = mp5 (0, -7.6, 21.9) mm, plus the same (+3.35, -5.36, 0) mm offset as
    // the rifles — the MP5 shows the most hand of the nine (its wrapper is the
    // closest long gun) and it hides the same way.
    pos: [-0.00660, -0.01078, 0.02399], rot: [-0.300, 0.524, 0], scale: NPC_ARM_SCALE,
    fallback: [0, -0.0384, -0.0019],
  },
  sniper: {
    // grip = awp (0, -7.3, 23.5) mm. The AWP wrapper is the smallest of the
    // eleven (0.80), so this is the weapon on which the hand now reads smallest
    // in camera space — correct, because its gun is drawn smallest too, and it
    // is the 1.2 m rifle that was reported as being swallowed by the fist.
    pos: [-0.00998, -0.00500, 0.02564], rot: [-0.300, 0.524, 0], scale: NPC_ARM_SCALE,
    fallback: [0, -0.0377, 0.0515],
  },
  pistol: {
    // grip = mean usp/glock/deagle = (0, -20.8, 30.1) mm
    pos: [-0.00996, -0.01854, 0.03216], rot: [-0.300, 0.524, 0], scale: NPC_ARM_SCALE,
    fallback: [0, -0.0272, 0.0079],
  },
  knife: {
    pos: [0.00181, 0.01924, 0.00165], rot: [0.244, 0.384, 0], scale: NPC_ARM_SCALE,
    fallback: [0, 0, 0.050],
  },
  grenade: {
    // The group is pinned to 1 and only the grenade content is scaled 1.05, so
    // the hand is 5% small against the grenade and exactly right against the
    // other ten weapons. That is the trade that matters: the player switches.
    pos: [0.00181, 0.01924, 0.00165], rot: [0.244, 0.384, 0], scale: NPC_ARM_SCALE,
    fallback: [0, 0, 0],
  },
};

export const NPC_ARM_GRIP = {
  rifle: { curl: [0.35, 0.20, 0.12], thumb: [0.15, 0.05, 0.10] },
  smg: { curl: [0.35, 0.20, 0.12], thumb: [0.15, 0.05, 0.10] },
  sniper: { curl: [0.35, 0.20, 0.12], thumb: [0.15, 0.05, 0.10] },
  pistol: { curl: [1.20, 0.50, 0.30], thumb: [0.35, 0.10, 0.30] },
  knife: { curl: [0.55, 0.35, 0.20], thumb: [0.20, 0, 0.15] },
  grenade: { curl: [0.55, 0.35, 0.20], thumb: [0.20, 0, 0.15] },
};

const NPC_FINGER_CHAINS = [
  ['Index1R', 'Index2R', 'Index3R'],
  ['Middle1R', 'Middle2R', 'Middle3R'],
  ['Pinky1R', 'Pinky2R', 'Pinky3R'],
];

/**
 * Close the cloned hand's fingers onto the grip.
 *
 * ABSOLUTE, never cumulative: the rest rotation is cached on the bone the first
 * time it is touched and every call writes `rest - curl`. `_poseNPCArms` runs
 * again whenever a weapon's real model replaces its fallback, and a `-=` there
 * would fold the hand twice into its own wrist the moment the procedural build
 * landed.
 */
export function applyNPCArmGrip(arms, family, override = null) {
  const spec = override || NPC_ARM_GRIP[family];
  if (!arms || !spec) return;
  const bones = new Map();
  arms.traverse((o) => {
    if (o.isBone) bones.set(o.name, o);
  });
  const rest = (bone, axis) => {
    const key = 'npcRest' + axis;
    if (bone.userData[key] === undefined) bone.userData[key] = bone.rotation[axis];
    return bone.userData[key];
  };
  for (const chain of NPC_FINGER_CHAINS) {
    for (let i = 0; i < chain.length; i++) {
      const bone = bones.get(chain[i]);
      if (!bone) continue;
      bone.rotation.x = rest(bone, 'x') - (spec.curl[i] || 0);
    }
  }
  const t1 = bones.get('Thumb1R');
  const t2 = bones.get('Thumb2R');
  if (t1) {
    t1.rotation.x = rest(t1, 'x') - (spec.thumb[0] || 0);
    t1.rotation.z = rest(t1, 'z') + (spec.thumb[1] || 0);
  }
  if (t2) t2.rotation.x = rest(t2, 'x') - (spec.thumb[2] || 0);
  arms.updateMatrixWorld(true);
}

