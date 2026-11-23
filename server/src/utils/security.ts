import { logger } from "./logger.js";
import { getPool } from "../database/postgres.js";

export type AnomalyType =
  | "COOLDOWN_VIOLATION"
  | "RANGE_VIOLATION"
  | "WALL_HACK"
  | "SPEED_ANOMALY"
  | "ITEM_EXPLOIT"
  | "CHAT_SPAM"
  | "INVALID_PACKET";

export interface SecurityAnomaly {
  id: number;
  timestamp: number;
  sessionId: string;
  characterName: string;
  accountId?: string;
  type: AnomalyType;
  details: string;
}

const MAX_IN_MEMORY_LOGS = 100;
let anomalySeq = 0;
const inMemoryAnomalies: SecurityAnomaly[] = [];

// Rate limiter for console warning per (characterName + type) to avoid console spam
const lastLoggedAt = new Map<string, number>();

export function recordAnomaly(
  sessionId: string,
  characterName: string,
  type: AnomalyType,
  details: string,
  accountId?: string
): void {
  const now = Date.now();
  const entry: SecurityAnomaly = {
    id: ++anomalySeq,
    timestamp: now,
    sessionId,
    characterName,
    accountId,
    type,
    details,
  };

  inMemoryAnomalies.unshift(entry);
  if (inMemoryAnomalies.length > MAX_IN_MEMORY_LOGS) {
    inMemoryAnomalies.pop();
  }

  // Throttle warning logs to once every 3 seconds per player+type
  const throttleKey = `${characterName}:${type}`;
  const prev = lastLoggedAt.get(throttleKey) ?? 0;
  if (now - prev >= 3000) {
    lastLoggedAt.set(throttleKey, now);
    logger.warn(`[SECURITY ANOMALY] [${type}] Player "${characterName}" (${sessionId}): ${details}`);
  }

  // Persist to Postgres if database is active
  const pool = getPool();
  if (pool) {
    pool
      .query(
        `INSERT INTO security_anomalies (account_id, character_name, anomaly_type, details)
         VALUES ($1, $2, $3, $4)`,
        [accountId || null, characterName, type, details]
      )
      .catch((err) => {
        // Table might not exist yet if migration hasn't run; ignore quietly
        if ((err as any)?.code !== "42P01") {
          logger.debug("Could not persist security anomaly to DB", err);
        }
      });
  }
}

export function getRecentAnomalies(limit = 15, playerNameFilter?: string): SecurityAnomaly[] {
  let list = inMemoryAnomalies;
  if (playerNameFilter) {
    const filter = playerNameFilter.toLowerCase();
    list = list.filter((a) => a.characterName.toLowerCase().includes(filter));
  }
  return list.slice(0, limit);
}

export function clearAnomalies(): void {
  inMemoryAnomalies.length = 0;
}
