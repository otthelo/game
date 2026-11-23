function timestamp() {
    return new Date().toISOString().slice(11, 23);
}
function serializeMeta(meta) {
    if (meta === undefined)
        return "";
    if (meta instanceof Error)
        return ` ${meta.stack ?? meta.message}`;
    try {
        return ` ${JSON.stringify(meta)}`;
    }
    catch {
        return ` ${String(meta)}`;
    }
}
/**
 * Tiny dependency-free logger. In production only info/warn/error are emitted;
 * debug output is useful while iterating on the authoritative simulation.
 */
export const logger = {
    debug(message: string, meta?: unknown) {
        if (process.env.NODE_ENV === "production")
            return;
        console.debug(`[${timestamp()}] DEBUG ${message}${serializeMeta(meta)}`);
    },
    info(message: string, meta?: unknown) {
        console.log(`[${timestamp()}] INFO  ${message}${serializeMeta(meta)}`);
    },
    warn(message: string, meta?: unknown) {
        console.warn(`[${timestamp()}] WARN  ${message}${serializeMeta(meta)}`);
    },
    error(message: string, meta?: unknown) {
        console.error(`[${timestamp()}] ERROR ${message}${serializeMeta(meta)}`);
    },
};
