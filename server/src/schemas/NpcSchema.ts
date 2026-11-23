import { schema, t } from "@colyseus/schema";
/** NPCs are static, but they live in schema so clients can render and click them. */
export const NpcSchema = schema({
    id: t.string().default(""),
    name: t.string().default(""),
    x: t.number().default(0),
    y: t.number().default(0),
    dir: t.uint8().default(0),
    kind: t.uint8().default(0),
}, "Npc");
