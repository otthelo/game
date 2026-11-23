import { schema, t } from "@colyseus/schema";
/** Synced monster view. `kind` and `state` map to the client enums. */
export const MonsterSchema = schema({
    id: t.string().default(""),
    kind: t.uint8().default(0),
    name: t.string().default(""),
    x: t.number().default(0),
    y: t.number().default(0),
    dir: t.uint8().default(0),
    hp: t.uint16().default(1),
    maxHp: t.uint16().default(1),
    state: t.uint8().default(0),
}, "Monster");
