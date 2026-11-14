'use strict'

function integer(name, fallback, minimum, maximum) {
    const raw = process.env[name]
    const value = raw == null || raw === '' ? fallback : Number(raw)
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`Error: ${name} must be an integer in [${minimum}, ${maximum}]`)
    }
    return value
}

function bool(name, fallback) {
    const raw = process.env[name]
    if (raw == null || raw === '') {
        return fallback
    }
    if (['true', '1', 'yes'].includes(raw.toLowerCase())) {
        return true
    }
    if (['false', '0', 'no'].includes(raw.toLowerCase())) {
        return false
    }
    throw new Error(`Error: ${name} must be true or false`)
}

function loadConfig() {
    const auth = process.env.MC_AUTH || 'offline'
    if (!['offline', 'microsoft'].includes(auth)) {
        throw new Error('Error: MC_AUTH must be offline or microsoft')
    }
    const worldId = process.env.MC_WORLD_ID || ''
    if (worldId && !/^[a-zA-Z0-9_-]{1,64}$/.test(worldId)) {
        throw new Error('Error: MC_WORLD_ID must contain 1–64 letters, digits, underscores or hyphens')
    }
    const requestedVersion = process.env.MC_VERSION || false
    return {
        connection: {
            host: process.env.MC_HOST || '127.0.0.1',
            port: integer('MC_PORT', 25565, 1, 65535),
            username: process.env.MC_USERNAME || 'Bot',
            auth,
            version: requestedVersion === '26.1.2' ? '26.1' : requestedVersion,
            viewDistance: process.env.BOT_VIEW_DISTANCE || 'normal',
            profilesFolder: '.minecraft-profiles'
        },
        owner: process.env.MC_OWNER || '',
        worldId,
        probeSpacing: integer('BOT_PROBE_SPACING', 5, 0, 64),
        seed: integer('BOT_SEED', 1, 0, 4294967295),
        reconnect: bool('BOT_RECONNECT', true),
        reconnectDelayMs: integer('BOT_RECONNECT_DELAY_MS', 10000, 1000, 300000),
        logLevel: process.env.BOT_LOG_LEVEL || 'info'
    }
}

module.exports = { loadConfig }
