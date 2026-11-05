'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { dryMovements, safeFooting } = require('./cave-exploration')
const { nightReady, retreatForNight } = require('./night-policy')

const PLANTS = new Set(['short_grass', 'tall_grass', 'fern', 'large_fern', 'dead_bush', 'leaf_litter'])
const BED_SPACE = new Set(['air', 'cave_air', 'void_air', ...PLANTS])
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function prepareBed(c, wool) {
    const signal = c.actionAbort?.signal
    c.checkAction(signal)
    if (c.bot.inventory.items().some(item => item.name.endsWith('_bed'))) {
        return
    }
    if (!wool || c.countItems([wool]) < 3) {
        throw new Error('three same-color wool are required for a bed')
    }
    await c.ensurePlanks(3)
    c.checkAction(signal)
    await c.ensureItem(wool.replace('_wool', '_bed'), 1, true)
    c.checkAction(signal)
}

async function huntAtNight(c, state) {
    const target = state.nightTarget
    if (!target || !nightReady(state)) {
        return
    }
    const signal = c.actionAbort?.signal
    const origin = c.bot.entity.position.clone()
    c.memory.nightHunt = { day: c.bot.time.day, dimension: state.dimension, count: state.nightHuntCount + 1 }
    c.log.info(`Night hunt: ${target.name}; attempt ${state.nightHuntCount + 1}/4; hp=${state.health}, food=${state.food}.`)
    c.bot.pathfinder.setMovements(dryMovements(c.bot))
    try {
        await c.fight(target, true, () => {
            c.checkAction(signal)
            const current = c.observe()
            if (!current.isNight) {
                return 'daylight ended the night hunt'
            }
            if (!nightReady(current)) {
                retreatForNight(c, 'health, supplies or nearby threats changed')
                return 'night hunt safety limit'
            }
            return c.bot.entity.position.distanceTo(origin) > 16 ? 'night hunt left its local area' : null
        })
    } finally {
        c.bot.pathfinder.setGoal(null)
        c.bot.deactivateItem()
        c.bot.pathfinder.setMovements(c.movements)
    }
}

async function clearPlants(c, positions) {
    const signal = c.actionAbort?.signal
    for (const p of positions) {
        c.checkAction(signal)
        const block = c.bot.blockAt(p)
        if (PLANTS.has(block?.name)) {
            if (!c.bot.canDigBlock(block)) {
                throw new Error('vegetation is outside safe placement reach')
            }
            await c.bot.dig(block, true)
            c.checkAction(signal)
        }
    }
}

function bedPlacement(c) {
    const feet = c.bot.entity.position.floored()
    for (let r = 1; r <= 3; r++) {
        for (let x = -r; x <= r; x++) {
            for (let z = -r; z <= r; z++) {
                if (Math.max(Math.abs(x), Math.abs(z)) !== r) {
                    continue
                }
                const foot = feet.offset(x, 0, z)
                if (c.bot.entity.position.distanceTo(foot.offset(0.5, 0, 0.5)) > 3.5) {
                    continue
                }
                for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
                    const head = foot.offset(dx, 0, dz)
                    if (!head.equals(feet) && [foot, head].every(p => safeFooting(c.bot, p, BED_SPACE))) {
                        return { foot, head }
                    }
                }
            }
        }
    }
    return null
}

async function sleepSafely(c, state) {
    const bot = c.bot
    const signal = c.actionAbort?.signal
    c.checkAction(signal)
    if (bot.game.dimension !== 'overworld') {
        throw new Error('beds are only used in the Overworld')
    }
    if (bot.isSleeping) {
        await sleep(1000)
        c.checkAction(signal)
        return
    }
    if (!state.canSleep) {
        return
    }
    try {
        let bed = c.findNearestBlock(name => name.endsWith('_bed'), 4)
        if (!bed) {
            await prepareBed(c, state.bedWool)
            c.checkAction(signal)
            const site = bedPlacement(c)
            if (!site) {
                throw new Error('no dry two-block bed site within reach')
            }
            await clearPlants(c, [site.foot, site.foot.offset(0, 1, 0), site.head, site.head.offset(0, 1, 0)])
            c.checkAction(signal)
            const item = bot.inventory.items().find(item => item.name.endsWith('_bed'))
            await bot.equip(item, 'hand')
            c.checkAction(signal)
            await bot.lookAt(bot.entity.position.offset(4 * (site.head.x - site.foot.x), 1.62, 4 * (site.head.z - site.foot.z)), true)
            c.checkAction(signal)
            if (bot.game.dimension !== 'overworld') {
                throw new Error('dimension changed before bed placement')
            }
            await bot._placeBlockWithOptions(bot.blockAt(site.foot.offset(0, -1, 0)), new Vec3(0, 1, 0), { forceLook: 'ignore' })
            c.checkAction(signal)
            bed = bot.blockAt(site.foot)
            if (!bed?.name.endsWith('_bed') || !bot.blockAt(site.head)?.name.endsWith('_bed')) {
                throw new Error('both bed halves were not confirmed')
            }
            c.memory.travelBed = { x: site.foot.x, y: site.foot.y, z: site.foot.z, dimension: 'overworld' }
            c.log.info(`Placed travel bed at ${site.foot}.`)
        }
        const current = c.observe()
        if (current.hostileDistance <= 12) {
            throw new Error('monsters approached the bed')
        }
        c.checkAction(signal)
        if (bot.game.dimension !== 'overworld') {
            throw new Error('dimension changed before sleep')
        }
        await bot.sleep(bed)
        c.checkAction(signal)
        if (!bot.isSleeping) {
            throw new Error('server did not confirm sleep')
        }
        c.log.info('Server confirmed sleep; other LAN players may also need to sleep to skip the night.')
    } catch (error) {
        c.checkAction(signal)
        c.memory.sleepRetry = { dimension: 'overworld', until: Date.now() + 60000 }
        c.log.warn(`Safe sleep unavailable: ${error.message}; replanning protection.`)
    }
}

async function leaveShelter(c) {
    const signal = c.actionAbort?.signal
    const center = c.shelterCenter
    c.checkAction(signal)
    if (!center || !c.hasEnclosedShelter(center)) {
        c.sheltered = false
        c.shelterCenter = null
        delete c.memory.shelter
        return
    }
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const target = center.offset(dx, 0, dz)
        const beyond = center.offset(2 * dx, 0, 2 * dz)
        const blocks = [target.offset(0, 1, 0), target].map(p => c.bot.blockAt(p))
        if (!safeFooting(c.bot, beyond) || blocks.some(b => !b || !b.diggable || !c.movements.safeToBreak(b))) {
            continue
        }
        for (const block of blocks) {
            c.checkAction(signal)
            await c.bot.tool.equipForBlock(block, { requireHarvest: true, getFromChest: false })
            c.checkAction(signal)
            await c.bot.dig(block, true)
        }
        c.checkAction(signal)
        c.sheltered = false
        c.shelterCenter = null
        delete c.memory.shelter
        await c.gotoWithTimeout(new goals.GoalBlock(target.x, target.y, target.z), 4000, 'shelter exit')
        c.log.info('Opened a supported shelter exit after resting.')
        return
    }
    throw new Error('no safe supported shelter exit')
}

module.exports = { prepareBed, huntAtNight, sleepSafely, leaveShelter, bedPlacement, clearPlants }
