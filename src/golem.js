'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { until } = require('./progression-skills')
const { withdrawItem } = require('./base')

// Hired Help (adventure/summon_iron_golem): four iron blocks in a T with a carved pumpkin on
// top. The two cells beside the body's lower block must stay air or the pattern fails.
const PATTERN = { body: [[0, 0], [0, 1]], arms: [[-1, 1], [1, 1]], air: [[-1, 0], [1, 0]], head: [0, 2] }
const NEEDED_INGOTS = 36

function golemState(c, state) {
    const pumpkin = c.hasAnyItem(['carved_pumpkin', 'pumpkin']) || c.findNearestBlock(name => name === 'pumpkin', 32)
    const stored = c.memory.base?.contents?.iron_ingot || 0
    const ingots = state.ironIngots + (c.hasItem('shears') ? 0 : -2)
    state.canSummonGolem = Boolean(!state.completedAdvancements?.has('minecraft:adventure/summon_iron_golem') &&
        state.dimension === 'overworld' && !state.underground && !state.isNight && state.hostileDistance > 16 &&
        (state.armorPoints || 0) >= 15 && state.hasCraftingTable && pumpkin && ingots + stored >= NEEDED_INGOTS &&
        !(c.memory.golem?.failures >= 3 && Date.now() - c.memory.golem.at < 600000))
    return state
}

// A flat spot where the golem T, its head and the two air corners fit, 2–4 blocks away.
function golemSite(bot, feet) {
    const empty = p => ['air', 'cave_air', 'short_grass', 'tall_grass'].includes(bot.blockAt(p, false)?.name)
    for (let r = 2; r <= 4; r++) {
        for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
            const o = feet.offset(dx, 0, dz)
            const cells = [...PATTERN.body, ...PATTERN.arms, ...PATTERN.air, PATTERN.head].map(([x, y]) => o.offset(x, y, 0))
            if (bot.blockAt(o.offset(0, -1, 0), false)?.boundingBox === 'block' && cells.every(empty)) {
                return o
            }
        }
    }
    return null
}

async function placeNamed(c, name, target) {
    const bot = c.bot
    for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const ref = bot.blockAt(target.offset(dx, dy, dz), false)
        if (ref?.boundingBox === 'block') {
            await bot.equip(c.bestItem([name]), 'hand')
            await bot.placeBlock(ref, new Vec3(-dx, -dy, -dz))
            return
        }
    }
    throw new Error(`no support to place ${name} at ${target}`)
}

async function summonGolem(c) {
    const bot = c.bot
    const memory = c.memory.golem ??= { failures: 0, at: 0 }
    try {
        const want = NEEDED_INGOTS + (c.hasItem('shears') ? 0 : 2) - c.countItems(['iron_ingot'])
        if (want > 0) {
            await withdrawItem(c, 'iron_ingot', want)
        }
        if (c.countItems(['iron_ingot']) < NEEDED_INGOTS + (c.hasItem('shears') ? 0 : 2)) {
            throw new Error('not enough iron ingots for four iron blocks')
        }
        if (!c.hasItem('shears')) {
            await c.ensureItem('shears', 1, true)
        }
        if (!c.hasItem('carved_pumpkin')) {
            const pumpkin = c.findNearestBlock(name => name === 'pumpkin', 32)
            if (!pumpkin) {
                throw new Error('no pumpkin within 32 blocks')
            }
            const p = pumpkin.position
            await c.gotoWithTimeout(new goals.GoalNear(p.x, p.y, p.z, 2), 15000, 'pumpkin approach')
            await bot.equip(c.bestItem(['shears']), 'hand')
            await bot.activateBlock(bot.blockAt(p))
            await until(c, () => bot.blockAt(p)?.name === 'carved_pumpkin', 2000)
            await c.collectTarget(bot.blockAt(p), bot.blockAt(p), 'carved pumpkin')
            if (!c.hasItem('carved_pumpkin')) {
                throw new Error('carved pumpkin was not collected')
            }
        }
        await c.ensureItem('iron_block', 4, true)
        const site = golemSite(bot, bot.entity.position.floored())
        if (!site) {
            throw new Error('no clear flat site for the golem within four blocks')
        }
        for (const [x, y] of [...PATTERN.body, ...PATTERN.arms]) {
            c.checkAction()
            await placeNamed(c, 'iron_block', site.offset(x, y, 0))
        }
        await placeNamed(c, 'carved_pumpkin', site.offset(PATTERN.head[0], PATTERN.head[1], 0))
        await until(c, () => c.advancements.completed.has('minecraft:adventure/summon_iron_golem'), 4000)
        c.log.info(`Summoned an iron golem at ${site}; Hired Help confirmed by the server.`)
        memory.failures = 0
    } catch (error) {
        memory.failures += 1
        memory.at = Date.now()
        throw error
    }
}

module.exports = { golemState, golemSite, summonGolem, PATTERN }
