export type JobId = "novice" | "swordsman" | "archer" | "mage" | "knight";

export interface JobDefinition {
  id: JobId;
  name: string;
  tier: 0 | 1 | 2; // 0 = Novice, 1 = First Job, 2 = Second Job
  parentJobId: JobId | null;
  requiredBaseLevel: number;
  requiredJobLevel: number;
  maxJobLevel: number;
  spritePrefix: string;
  description: string;
  baseStats: {
    maxHp: number;
    maxSp: number;
    str: number;
    agi: number;
    dex: number;
    int: number;
    vit: number;
    luk: number;
  };
  statGrowthPerLevel: {
    hp: number;
    sp: number;
    str: number;
    agi: number;
    dex: number;
    int: number;
    vit: number;
    luk: number;
  };
  unlockedSkills: string[];
}

export const JOBS: Record<string, JobDefinition> = {
  novice: {
    id: "novice",
    name: "Novice",
    tier: 0,
    parentJobId: null,
    requiredBaseLevel: 1,
    requiredJobLevel: 1,
    maxJobLevel: 10,
    spritePrefix: "novice",
    description: "Petualang pemula yang sedang mempelajari dasar-dasar bertahan hidup di dunia realm.",
    baseStats: {
      maxHp: 100,
      maxSp: 20,
      str: 1,
      agi: 1,
      vit: 1,
      int: 1,
      dex: 1,
      luk: 1,
    },
    statGrowthPerLevel: {
      hp: 12,
      sp: 3,
      str: 0,
      agi: 0,
      dex: 0,
      int: 0,
      vit: 0,
      luk: 0,
    },
    unlockedSkills: ["basic-attack", "first-aid"],
  },
  swordsman: {
    id: "swordsman",
    name: "Swordsman",
    tier: 1,
    parentJobId: "novice",
    requiredBaseLevel: 1,
    requiredJobLevel: 10,
    maxJobLevel: 50,
    spritePrefix: "swordsman",
    description: "Pendekar pedang dengan pertahanan kokoh, HP tebal, dan serangan tebasan mematikan.",
    baseStats: {
      maxHp: 180,
      maxSp: 30,
      str: 5,
      agi: 3,
      vit: 5,
      int: 1,
      dex: 3,
      luk: 1,
    },
    statGrowthPerLevel: {
      hp: 24,
      sp: 4,
      str: 1,
      agi: 0,
      dex: 0,
      int: 0,
      vit: 1,
      luk: 0,
    },
    unlockedSkills: ["bash", "magnum-break", "sword-mastery", "increase-hp-recovery"],
  },
  archer: {
    id: "archer",
    name: "Archer",
    tier: 1,
    parentJobId: "novice",
    requiredBaseLevel: 1,
    requiredJobLevel: 10,
    maxJobLevel: 50,
    spritePrefix: "archer",
    description: "Penembak jitu jarak jauh dengan akurasi dan kecepatan serangan yang sangat tinggi.",
    baseStats: {
      maxHp: 130,
      maxSp: 45,
      str: 2,
      agi: 6,
      vit: 2,
      int: 2,
      dex: 7,
      luk: 2,
    },
    statGrowthPerLevel: {
      hp: 16,
      sp: 6,
      str: 0,
      agi: 1,
      dex: 1,
      int: 0,
      vit: 0,
      luk: 0,
    },
    unlockedSkills: ["double-strafe", "arrow-shower", "owl-eye", "vulture-eye"],
  },
  mage: {
    id: "mage",
    name: "Mage",
    tier: 1,
    parentJobId: "novice",
    requiredBaseLevel: 1,
    requiredJobLevel: 10,
    maxJobLevel: 50,
    spritePrefix: "mage",
    description: "Penguasa elemen sihir dengan Magic Attack dahsyat dan cadangan SP melimpah.",
    baseStats: {
      maxHp: 110,
      maxSp: 90,
      str: 1,
      agi: 2,
      vit: 2,
      int: 8,
      dex: 4,
      luk: 2,
    },
    statGrowthPerLevel: {
      hp: 14,
      sp: 12,
      str: 0,
      agi: 0,
      dex: 0,
      int: 2,
      vit: 0,
      luk: 0,
    },
    unlockedSkills: ["fire-bolt", "cold-bolt", "lightning-bolt", "increase-sp-recovery"],
  },
  knight: {
    id: "knight",
    name: "Knight",
    tier: 2,
    parentJobId: "swordsman",
    requiredBaseLevel: 40,
    requiredJobLevel: 40,
    maxJobLevel: 50,
    spritePrefix: "knight",
    description: "Ksatria perkasa tingkat 2 dengan tombak dan pedang besar, benteng terkuat di garis depan.",
    baseStats: {
      maxHp: 340,
      maxSp: 65,
      str: 10,
      agi: 7,
      vit: 10,
      int: 2,
      dex: 6,
      luk: 3,
    },
    statGrowthPerLevel: {
      hp: 36,
      sp: 6,
      str: 2,
      agi: 1,
      dex: 0,
      int: 0,
      vit: 2,
      luk: 0,
    },
    unlockedSkills: ["bowling-bash", "pierce", "spear-mastery", "two-hand-quicken"],
  },
};

/** Returns job XP required to reach next job level. */
export function jobXpToNextLevel(jobId: JobId, jobLevel: number): number {
  const def = JOBS[jobId] ?? JOBS.novice;
  if (jobLevel >= def.maxJobLevel) return 0;
  // Novice requires fast progression (Lv 1->10)
  if (def.tier === 0) {
    return Math.floor(15 * Math.pow(jobLevel, 1.3));
  }
  // 1st / 2nd jobs scale smoothly
  return Math.floor(35 * Math.pow(jobLevel, 1.4));
}

/** Validates whether a character can change from currentJobId to targetJobId. */
export function canChangeJob(
  currentJobId: JobId,
  baseLevel: number,
  jobLevel: number,
  targetJobId: JobId,
): { ok: true } | { ok: false; reason: string } {
  const target = JOBS[targetJobId];
  if (!target) return { ok: false, reason: "Job tidak valid." };

  if (target.parentJobId !== currentJobId) {
    return {
      ok: false,
      reason: `${target.name} bukan merupakan turunan dari job Anda saat ini (${JOBS[currentJobId]?.name ?? currentJobId}).`,
    };
  }

  if (baseLevel < target.requiredBaseLevel) {
    return {
      ok: false,
      reason: `Base Level belum mencukupi (Butuh Base Lv. ${target.requiredBaseLevel}).`,
    };
  }

  if (jobLevel < target.requiredJobLevel) {
    return {
      ok: false,
      reason: `Job Level belum mencukupi (Butuh Job Lv. ${target.requiredJobLevel}).`,
    };
  }

  return { ok: true };
}

/** Lists available next-tier jobs for a given character. */
export function availableJobAdvancements(currentJobId: JobId): JobDefinition[] {
  return Object.values(JOBS).filter((j) => j.parentJobId === currentJobId);
}
