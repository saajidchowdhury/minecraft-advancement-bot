'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { dryMovements } = require('./cave-exploration')

// User direction (2026-11-11): on hearing a sculk detector or seeing warden-related blocks, hold sneak,
// leave the area and mine somewhere completely different. A shrieker summoned a warden that killed a
// geared bot through its shelter in 10 s (07:44Z). Sneaking makes no step vibrations; digging still does.
const SCULK = ['sculk', 'sculk_vein', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker', 'sculk_catalyst']
const ALARM_SOUND = /sculk_sensor\.clicking|sculk_shrieker|warden\./
const SEEN_RANGE = 16
const CLEAR_RANGE = 24
const ZONE_RADIUS = 48
const QUIET_MS = 30000

const zoneCenter = zone => new Vec3(zone.x, zone.y, zone.z)

function sculkZoneAt(c, position) {
    return (c.memory.sculkZones || []).find(zone => zone.dimension === c.bot.game?.dimension &&
        position.distanceTo(zoneCenter(zone)) <= zone.radius) || null
}

function nearestSculk(bot, range) {
    const ids = SCULK.map(name => bot.registry.blocksByName[name]?.id).filter(id => id !== undefined)
    return ids.length ? bot.findBlock({ matching: ids, maxDistance: range }) : null
}

function sculkAlarm(c, reason, at = null) {
    const bot = c.bot
    const center = (at ?? bot.entity.position).floored()
    const zones = c.memory.sculkZones ??= []
    if (!zones.some(zone => zone.dimension === bot.game.dimension && center.distanceTo(zoneCenter(zone)) <= zone.radius / 2)) {
        zones.push({ dimension: bot.game.dimension, x: center.x, y: center.y, z: center.z, radius: ZONE_RADIUS })
        zones.splice(0, Math.max(0, zones.length - 32))
    }
    const frontier = c.memory.tunnelFrontier
    if (frontier && sculkZoneAt(c, new Vec3(frontier.x, frontier.y, frontier.z))) {
        c.memory.tunnelFrontier = null
    }
    const fresh = !c.sculkCaution
    c.sculkCaution = { since: c.sculkCaution?.since ?? Date.now(), alarmAt: Date.now() }
    if (!fresh) {
        return
    }
    c.log.warn(`Sculk caution: ${reason}; sneaking out of the area to mine elsewhere.`)
    c.urgentReplan = true
    if (c.busy && c.activeAction !== 'flee_sculk' && !c.actionAbort?.signal.aborted) {
        c.cancelCurrentTask('sculk alarm')
    } else if (!c.busy) {
        c.scheduleLoop?.(0)
    }
}

// Once a second: sculk in range, Darkness or a warden raise the alarm; caution ends only outside every
// zone, with no sculk within 24 blocks, no Darkness and 30 s without an alarm.
function updateSculkCaution(c) {
    const bot = c.bot
    if (!bot.entity || bot.game?.dimension !== 'overworld') {
        return
    }
    const sculk = nearestSculk(bot, c.sculkCaution ? CLEAR_RANGE : SEEN_RANGE)
    const darknessId = bot.registry.effectsByName?.Darkness?.id
    const dark = darknessId !== undefined && Boolean(bot.entity.effects?.[darknessId])
    const warden = bot.nearestEntity?.(e => e.name === 'warden' && e.position.distanceTo(bot.entity.position) <= 32)
    if (sculk && !c.sculkCaution) {
        sculkAlarm(c, `${sculk.name} at ${sculk.position}`, sculk.position)
    }
    if (dark) {
        sculkAlarm(c, 'Darkness effect')
    }
    if (warden) {
        sculkAlarm(c, `warden at ${warden.position.floored()}`, warden.position)
    }
    if (c.sculkCaution && !sculk && !dark && !warden && Date.now() - c.sculkCaution.alarmAt >= QUIET_MS &&
        !sculkZoneAt(c, bot.entity.position)) {
        c.sculkCaution = null
        bot.setControlState('sneak', false)
        c.log.info('Sculk caution cleared: no sculk within 24 blocks and outside every sculk zone.')
    }
}

function installSculkCaution(c) {
    const bot = c.bot
    let ticks = 0
    bot.on('soundEffectHeard', (name, position) => {
        if (c.running && bot.entity && ALARM_SOUND.test(name) && position.distanceTo(bot.entity.position) <= 32) {
            sculkAlarm(c, `heard ${name}`, position)
        }
    })
    bot.on('physicsTick', () => {
        if (++ticks % 20 === 0 && c.running) {
            updateSculkCaution(c)
        }
        if (c.sculkCaution) {
            bot.setControlState('sneak', true)
        }
    })
}

// Sneaking stops at ledges, so the escape path takes no drops; sensors and shriekers are never broken.
async function fleeSculk(c) {
    const bot = c.bot
    const here = bot.entity.position
    const zone = sculkZoneAt(c, here)
    if (!zone) {
        return
    }
    const away = here.minus(zoneCenter(zone))
    const heading = Math.hypot(away.x, away.z) > 0.5 ? Math.atan2(away.z, away.x) : Math.random() * 2 * Math.PI
    const reach = zone.radius - here.distanceTo(zoneCenter(zone)) + 8
    const goal = new goals.GoalNearXZ(Math.floor(here.x + reach * Math.cos(heading)), Math.floor(here.z + reach * Math.sin(heading)), 4)
    const moves = dryMovements(bot)
    moves.canDig = true
    moves.maxDropDown = 0
    moves.allowSprinting = false
    for (const name of ['sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker']) {
        moves.blocksCantBreak.add(bot.registry.blocksByName[name].id)
    }
    c.log.info(`Sneaking out of the sculk zone around ${zoneCenter(zone)} toward ${goal.x},${goal.z}.`)
    bot.pathfinder.setMovements(moves)
    try {
        await c.gotoWithTimeout(goal, 45000, 'sculk flee')
    } finally {
        bot.pathfinder.setMovements(c.movements)
    }
}

module.exports = { SCULK, installSculkCaution, updateSculkCaution, sculkAlarm, sculkZoneAt, fleeSculk }
