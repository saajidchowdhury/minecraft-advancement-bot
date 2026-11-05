'use strict'

const { Vec3 } = require('vec3')
const { until } = require('./progression-skills')

// A Seedy Place (husbandry/plant_seed) in 26.1.2 accepts wheat, beetroots, melon/pumpkin
// stems, torchflower, pitcher pods or nether wart; carrots and potatoes do not count.
const SEEDS = ['wheat_seeds', 'beetroot_seeds', 'melon_seeds', 'pumpkin_seeds', 'torchflower_seeds', 'pitcher_pod']
const GRASS = ['short_grass', 'tall_grass']
const TILLABLE = ['grass_block', 'dirt', 'dirt_path', 'coarse_dirt']

function farmingState(c, state) {
    const memory = c.memory.planting
    state.canPlantSeed = Boolean(!state.completedAdvancements?.has('minecraft:husbandry/plant_seed') && state.dimension === 'overworld' &&
        !state.underground && !state.isNight && state.hostileDistance > 16 && state.hasCraftingTable &&
        (c.hasItem('wooden_hoe') || c.hasAnyItem(['stone_hoe', 'iron_hoe', 'diamond_hoe']) || state.planks + state.logs * 4 >= 4) &&
        (c.hasAnyItem(SEEDS) || c.findNearestBlock(name => GRASS.includes(name), 16)) &&
        !(memory?.failures >= 3 && Date.now() - memory.at < 600000))
    return state
}

async function plantSeed(c) {
    const bot = c.bot
    const memory = c.memory.planting ??= { failures: 0, at: 0 }
    try {
        // Short grass drops wheat seeds one time in eight; a dozen breaks nearly always suffice.
        for (let i = 0; i < 12 && !c.hasAnyItem(SEEDS); i++) {
            c.checkAction()
            const grass = c.findNearestBlock(name => GRASS.includes(name), 16)
            if (!grass) {
                throw new Error('no grass nearby for seeds')
            }
            await c.collectTarget(grass, grass, 'seed grass')
        }
        if (!c.hasAnyItem(SEEDS)) {
            throw new Error('grass gave no seeds')
        }
        if (!c.hasAnyItem(['wooden_hoe', 'stone_hoe', 'iron_hoe', 'diamond_hoe'])) {
            await c.ensurePlanks(2)
            if (c.countItems(['stick']) < 2) {
                await c.ensurePlanks(4)
                await c.ensureItem('stick', 4, false)
            }
            await c.ensureItem('wooden_hoe', 1, true)
        }
        c.checkAction()
        const feet = bot.entity.position.floored()
        const soil = c.findNearestBlock(name => TILLABLE.includes(name), 5, {
            filter: b => !(b.position.x === feet.x && b.position.z === feet.z) &&
                ['air', 'cave_air'].includes(bot.blockAt(b.position.offset(0, 1, 0))?.name)
        })
        if (!soil) {
            throw new Error('no tillable soil with open air above within reach')
        }
        await bot.equip(c.bestItem(['diamond_hoe', 'iron_hoe', 'stone_hoe', 'wooden_hoe']), 'hand')
        await bot.lookAt(soil.position.offset(0.5, 1, 0.5), true)
        await bot.activateBlock(soil, new Vec3(0, 1, 0))
        await until(c, () => bot.blockAt(soil.position)?.name === 'farmland', 2000)
        c.checkAction()
        await bot.equip(c.bestItem(SEEDS), 'hand')
        await bot.activateBlock(bot.blockAt(soil.position), new Vec3(0, 1, 0))
        await until(c, () => c.advancements.completed.has('minecraft:husbandry/plant_seed'), 4000)
        c.log.info(`Planted a seed at ${soil.position.offset(0, 1, 0)}; A Seedy Place confirmed by the server.`)
        memory.failures = 0
    } catch (error) {
        memory.failures += 1
        memory.at = Date.now()
        throw error
    }
}

module.exports = { farmingState, plantSeed, SEEDS }
