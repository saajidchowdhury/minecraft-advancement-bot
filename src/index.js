'use strict'

const mineflayer = require('mineflayer')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { format } = require('node:util')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { nextAdvancement } = require('./advancement-plan')
const { loadMemory, saveMemory } = require('./memory')
const { loadConfig } = require('./config')
const { SurvivalController } = require('./survival-bot')

const config = loadConfig()
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
}).formatToParts(new Date()).map(p => [p.type, p.value]))
const runDir = path.join('outputs', `${parts.year}-${parts.month}-${parts.day}@${parts.hour}.${parts.minute}.${parts.second}`)
fs.mkdirSync(runDir, { recursive: true })
const startedAt = Date.now()
const sourceHashes = Object.fromEntries(fs.readdirSync('src').filter(name => name.endsWith('.js')).map(name =>
    [name, createHash('sha256').update(fs.readFileSync(path.join('src', name))).digest('hex')]))
let gitRevision = null
try { gitRevision = execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch (_) {}
fs.writeFileSync(path.join(runDir, 'session.json'), JSON.stringify({
    startedAt: new Date(startedAt).toISOString(), hostname: os.hostname(), pid: process.pid,
    node: process.version, config, gitRevision, sourceHashes,
    mineflayer: require('mineflayer/package.json').version
}, null, 4))
fs.writeFileSync(path.join(runDir, 'p.pid'), `${process.pid}\n`)
console.log(`Run logs: ${path.resolve(runDir)}`)
let bot = null
let controller = null
let shuttingDown = false
let reconnectTimer = null
let compatibilityBlocked = false
const memoryFile = config.worldId ? path.join('.state', `${config.worldId}.json`) : null
const survivalMemory = loadMemory(memoryFile)

const levels = { debug: 10, info: 20, warn: 30, error: 40 }
const selectedLevel = levels[config.logLevel] || levels.info
const log = {}
for (const [name, value] of Object.entries(levels)) {
    log[name] = (...args) => {
        if (value < selectedLevel) {
            return
        }
        const method = name === 'debug' ? 'log' : name
        const message = `[${new Date().toISOString()}] [${name.toUpperCase()}] ${format(...args)}`
        console[method](message)
        fs.appendFileSync(path.join(runDir, 'bot.log'), `${message}\n`)
    }
}

function isUnsupportedVersionError (error) {
    const message = error && error.message ? error.message : String(error)
    return message.includes('No data available for version') || message.includes('unsupported protocol version')
}

function reportConnectionError (error) {
    if (isUnsupportedVersionError(error)) {
        compatibilityBlocked = true
        log.error(`${error.message}. This Mineflayer release supports Minecraft through 26.1. ` +
            'The tested 26.1.2 LAN setup uses MC_VERSION=26.1.2 (protocol 775).')
        return
    }
    log.error(error.stack || error.message)
}

function connect () {
    if (shuttingDown) {
        return
    }
    log.info(`Connecting to ${config.connection.host}:${config.connection.port} with ${config.connection.auth} authentication...`)
    try {
        // Mineflayer auto-versioning mutates its options object. A fresh copy keeps a
        // failed version probe from poisoning subsequent reconnect attempts.
        bot = mineflayer.createBot({ ...config.connection })
    } catch (error) {
        reportConnectionError(error)
        process.exitCode = 1
        return
    }
    bot._client.on('login', packet => {
        const seed = packet.worldState?.hashedSeed ?? packet.hashedSeed
        if (seed == null) {
            return
        }
        const fingerprint = String(seed)
        if (survivalMemory.worldSeedFingerprint && survivalMemory.worldSeedFingerprint !== fingerprint) {
            for (const key of Object.keys(survivalMemory)) {
                delete survivalMemory[key]
            }
            Object.assign(survivalMemory, { blockedTargets: new Map(), scoutVisits: new Map(), ownedStations: new Set() })
            if (controller) { controller.paused = false; controller.followPlayer = null }
            log.warn('World seed changed; cleared coordinates and mining routes from the previous world.')
        }
        survivalMemory.worldSeedFingerprint = fingerprint
    })
    controller = new SurvivalController(bot, {
        owner: config.owner, seed: config.seed, probeSpacing: config.probeSpacing, log, memory: survivalMemory,
        onState: (state, action) => {
            saveMemory(memoryFile, survivalMemory)
            const goal = nextAdvancement(state)
            const position = bot.entity.position
            fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
                updatedAt: new Date().toISOString(), wallSeconds: (Date.now() - startedAt) / 1000,
                action, goal, position, dimension: state.dimension, health: state.health, food: state.food,
                inventory: bot.inventory.items().map(item => ({ name: item.name, count: item.count })),
                equipment: Object.fromEntries(['head', 'torso', 'legs', 'feet', 'offhand'].map((name, i) =>
                    [name, bot.inventory.slots[[5, 6, 7, 8, 45][i]]?.name || null])),
                night: { timeOfDay: bot.time.timeOfDay, underground: state.underground,
                    ownerSleeping: state.sleepPartnerReady, ready: state.nightCombatReady, hostiles: state.hostileCount, retreat: state.retreatForNight },
                confirmedAdvancements: controller.advancements.summary()
            }, null, 4))
        }
    })

    bot.on('kicked', reason => log.warn('Kicked:', typeof reason === 'string' ? reason : JSON.stringify(reason)))
    bot.on('error', reportConnectionError)
    bot.on('end', reason => {
        log.warn(`Disconnected: ${reason}`)
        controller.stop()
        controller = null
        bot = null
        if (config.reconnect && !shuttingDown && !compatibilityBlocked) {
            log.info(`Reconnecting in ${config.reconnectDelayMs}ms...`)
            reconnectTimer = setTimeout(connect, config.reconnectDelayMs)
        } else if (compatibilityBlocked) {
            log.error('Automatic reconnect disabled until the Minecraft version/configuration is changed.')
            process.exitCode = 1
        }
    })
}

function shutdown (signal) {
    if (shuttingDown) {
        return
    }
    shuttingDown = true
    log.info(`Received ${signal}; shutting down.`)
    clearTimeout(reconnectTimer)
    if (controller) {
        controller.stop()
    }
    saveMemory(memoryFile, survivalMemory)
    fs.writeFileSync(path.join(runDir, 'finished.json'), JSON.stringify({
        signal, finishedAt: new Date().toISOString(), wallSeconds: (Date.now() - startedAt) / 1000
    }, null, 4))
    if (bot) {
        bot.quit('Bot shutting down')
    }
    setTimeout(() => process.exit(0), 500).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', error => log.error('Unhandled rejection:', error))
process.on('uncaughtException', error => {
    log.error(error.stack || error.message)
    shutdown('uncaughtException')
})

connect()
