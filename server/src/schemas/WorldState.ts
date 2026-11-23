import { schema, t } from "@colyseus/schema";
import { MonsterSchema } from "./MonsterSchema.js";
import { NpcSchema } from "./NpcSchema.js";
import { PlayerSchema } from "./PlayerSchema.js";
import { WorldSchema } from "./WorldSchema.js";
/** Root state synchronized to every client in the room. */
export const WorldState = schema({
    world: t.ref(WorldSchema),
    players: t.map(PlayerSchema),
    monsters: t.map(MonsterSchema),
    npcs: t.map(NpcSchema),
    tick: t.uint32().default(0),
}, "WorldState");
