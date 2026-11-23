import { schema, t } from "@colyseus/schema";
/**
 * Static map description. `rows` is marked `fullStateOnly()` because the ASCII
 * map never changes after room creation: it only needs to travel with the
 * initial full-state sync, not on every patch.
 */
export const WorldSchema = schema({
    name: t.string().default(""),
    width: t.number().default(0),
    height: t.number().default(0),
    tileSize: t.number().default(32),
    rows: t.array("string").fullStateOnly(),
}, "World");
