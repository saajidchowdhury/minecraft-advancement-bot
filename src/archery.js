'use strict'

const { Vec3 } = require('vec3')
const { until } = require('./progression-skills')

// Units: blocks, game ticks (50 ms). A full-draw arrow leaves at 3 blocks/tick and falls
// 0.05 blocks/tick^2 with 0.99 drag per tick, so near-flat shots drop about 0.025 t^2.
const ARROW_SPEED = 3
const ARROW_GRAVITY = 0.05
const FULL_DRAW_TICKS = 22
const TARGETS = new Set(['cow', 'pig', 'sheep', 'chicken', 'rabbit'])
const MIN_RANGE = 5
const MAX_RANGE = 14
const TAKE_AIM = 'minecraft:adventure/shoot_arrow'

const backedOff = memory => memory?.failures >= 3 && Date.now() - memory.at < 600000

function segmentDistance(p, a, b) {
    const ab = b.minus(a)
    const t = Math.max(0, Math.min(1, p.minus(a).dot(ab) / ab.dot(ab)))
    return p.distanceTo(a.plus(ab.scaled(t)))
}

function aimPoint(eye, target) {
    const center = target.position.offset(0, (target.height ?? 0.9) / 2, 0)
    const ticks = eye.distanceTo(center) / ARROW_SPEED
    const lead = target.velocity ? target.velocity.scaled(ticks) : new Vec3(0, 0, 0)
    return center.plus(lead).offset(0, 0.5 * ARROW_GRAVITY * ticks * ticks, 0)
}

// A target is clear when no player stands within two blocks of the arrow's path or just beyond it.
function clearShot(bot, target) {
    const eye = bot.entity.position.offset(0, bot.entity.height ?? 1.62, 0)
    const end = target.position.plus(target.position.minus(eye).normalize().scaled(3))
    return Object.values(bot.entities).every(e => e === bot.entity || e.type !== 'player' ||
        segmentDistance(e.position.offset(0, 1, 0), eye, end) > 2)
}

function archeryTarget(c) {
    const bot = c.bot
    const here = bot.entity.position
    return Object.values(bot.entities || {})
        .filter(e => e.isValid && TARGETS.has(e.name) && !c.isBlockedTarget(e))
        .map(entity => ({ entity, distance: here.distanceTo(entity.position) }))
        .filter(({ entity, distance }) => distance >= MIN_RANGE && distance <= MAX_RANGE &&
            Math.abs(entity.position.y - here.y) <= 4 && c.canSee(entity) && clearShot(bot, entity))
        .sort((a, b) => a.distance - b.distance)[0]?.entity || null
}

function stickPotential(state) {
    return state.sticks + 2 * (state.planks + 4 * state.logs)
}

function archeryState(c, state) {
    const hasBow = c.hasItem('bow')
    const hasArrow = c.hasItem('arrow')
    const sticks = (hasBow ? 0 : 3) + (hasArrow ? 0 : 1)
    state.canShootArrow = Boolean(!state.completedAdvancements?.has(TAKE_AIM) && state.dimension === 'overworld' &&
        !state.underground && !state.isNight && state.hostileDistance > 16 && !backedOff(c.memory.archery) &&
        (hasBow || c.countItems(['string']) >= 3) && (hasArrow || (c.hasItem('flint') && c.hasItem('feather'))) &&
        (sticks === 0 || (state.hasCraftingTable && stickPotential(state) >= sticks)) && archeryTarget(c))
    return state
}

// Take Aim: any entity hurt by the player's arrow. Shots go at passive animals in daylight,
// never across a player, and each attempt is bounded to three arrows.
async function shootArrow(c) {
    const bot = c.bot
    const memory = c.memory.archery ??= { failures: 0, at: 0 }
    try {
        const sticks = (c.hasItem('bow') ? 0 : 3) + (c.hasItem('arrow') ? 0 : 1)
        if (c.countItems(['stick']) < sticks) {
            await c.ensurePlanks(2)
            await c.ensureItem('stick', sticks, false)
        }
        await c.ensureItem('bow', 1, true)
        await c.ensureItem('arrow', 1, true)
        for (let shot = 0; shot < 3 && !c.advancements.completed.has(TAKE_AIM); shot++) {
            c.checkAction()
            const target = archeryTarget(c)
            if (!target) {
                throw new Error('no clear archery target within range')
            }
            await bot.equip(c.bestItem(['bow']), 'hand')
            const eye = () => bot.entity.position.offset(0, bot.entity.height ?? 1.62, 0)
            await bot.lookAt(aimPoint(eye(), target), true)
            bot.activateItem()
            try {
                for (let tick = 0; tick < FULL_DRAW_TICKS; tick += 2) {
                    await bot.waitForTicks(2)
                    c.checkAction()
                    await bot.lookAt(aimPoint(eye(), target), true)
                }
                if (!clearShot(bot, target)) {
                    throw new Error('a player moved into the line of fire')
                }
            } finally {
                bot.deactivateItem()
            }
            await until(c, () => c.advancements.completed.has(TAKE_AIM), 3000).catch(() => {})
        }
        if (!c.advancements.completed.has(TAKE_AIM)) {
            throw new Error('three arrows without a server-confirmed hit')
        }
        c.log.info('Hit a mob with an arrow; Take Aim confirmed by the server.')
        memory.failures = 0
    } catch (error) {
        memory.failures += 1
        memory.at = Date.now()
        throw error
    }
}

module.exports = { archeryState, shootArrow, aimPoint, clearShot, archeryTarget }
