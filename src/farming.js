'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
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
        (c.hasAnyItem(SEEDS) || c.findNearestBlock(name => GRASS.includes(name), 16, { mining: true })) &&
        !backedOff(memory))
    return state
}

async function plantSeed(c) {
    const bot = c.bot
    const memory = c.memory.planting ??= { failures: 0, at: 0 }
    try {
        // Short grass drops wheat seeds one time in eight; a dozen breaks nearly always suffice.
        for (let i = 0; i < 12 && !c.hasAnyItem(SEEDS); i++) {
            c.checkAction()
            const grass = c.findNearestBlock(name => GRASS.includes(name), 16, { mining: true })
            if (!grass) {
                throw new Error('no grass nearby for seeds')
            }
            // collectTarget skips collision-free blocks, so break grass and walk over the drop here.
            try {
                await c.gotoWithTimeout(new goals.GoalNear(grass.position.x, grass.position.y, grass.position.z, 2), 8000, 'seed grass')
            } catch (error) {
                c.checkAction()
                // findNearestBlock skips remembered targets, so the next pass tries other grass.
                c.rememberBlockedTarget?.(grass, 'seed grass', error)
                continue
            }
            await bot.dig(bot.blockAt(grass.position), true)
            await bot.waitForTicks(6)
            const [drop] = c.visibleDrops(grass.position.offset(0.5, 0, 0.5), 3)
            if (drop) {
                const p = drop.position.floored()
                await c.gotoWithTimeout(new goals.GoalNear(p.x, p.y, p.z, 0), 4000, 'seed pickup').catch(() => {})
                await bot.waitForTicks(4)
            }
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

const backedOff = memory => memory?.failures >= 3 && Date.now() - memory.at < 600000

function nearWater(c) {
    return c.findNearestBlock(name => name === 'water', 16, {
        filter: b => Number(b.getProperties?.().level ?? 0) === 0 && ['air', 'cave_air'].includes(c.bot.blockAt(b.position.offset(0, 1, 0))?.name)
    })
}

function fishingState(c, state) {
    state.canFish = Boolean(!state.completedAdvancements?.has('minecraft:husbandry/fishy_business') && state.dimension === 'overworld' &&
        !state.underground && !state.isNight && state.hostileDistance > 16 && !backedOff(c.memory.fishing) &&
        (c.hasItem('fishing_rod') || (c.countItems(['string']) >= 2 && state.hasCraftingTable && state.sticks + (state.planks + state.logs * 4) / 2 >= 3)) &&
        nearWater(c))
    return state
}

// Fishy Business: any fish hooked with a rod. bot.fish() reels in on the bite particles;
// each cast is bounded because bite detection depends on the particle packet format.
async function goFish(c) {
    const bot = c.bot
    const memory = c.memory.fishing ??= { failures: 0, at: 0 }
    try {
        if (!c.hasItem('fishing_rod')) {
            if (c.countItems(['stick']) < 3) {
                await c.ensurePlanks(2)
                await c.ensureItem('stick', 4, false)
            }
            await c.ensureItem('fishing_rod', 1, true)
        }
        const water = nearWater(c)
        if (!water) {
            throw new Error('no open water source within 16 blocks')
        }
        await c.gotoWithTimeout(new goals.GoalNear(water.position.x, water.position.y + 1, water.position.z, 3), 20000, 'fishing spot')
        for (let cast = 0; cast < 4 && !c.advancements.completed.has('minecraft:husbandry/fishy_business'); cast++) {
            c.checkAction()
            await bot.equip(c.bestItem(['fishing_rod']), 'hand')
            await bot.lookAt(water.position.offset(0.5, 1, 0.5), true)
            let timer
            await Promise.race([bot.fish(), new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('no bite within 45s')), 45000) })])
                .catch(error => {
                    bot.activateItem()
                    c.log.info(`Fishing cast ${cast + 1}: ${error.message}`)
                })
                .finally(() => clearTimeout(timer))
            await until(c, () => c.advancements.completed.has('minecraft:husbandry/fishy_business'), 2000).catch(() => {})
        }
        if (!c.advancements.completed.has('minecraft:husbandry/fishy_business')) {
            throw new Error('four casts without a server-confirmed catch')
        }
        c.log.info('Caught a fish; Fishy Business confirmed by the server.')
        memory.failures = 0
    } catch (error) {
        memory.failures += 1
        memory.at = Date.now()
        throw error
    }
}

// Breeding foods from the 26.1.2 item tags (chicken_food, cow_food, sheep_food, pig_food).
const BREEDING = { chicken: SEEDS, cow: ['wheat'], mooshroom: ['wheat'], sheep: ['wheat'], goat: ['wheat'], pig: ['carrot', 'potato', 'beetroot'] }

function breedingPair(c) {
    const bot = c.bot
    const here = bot.entity.position
    for (const [species, foods] of Object.entries(BREEDING)) {
        if (!c.hasAnyItem(foods)) {
            continue
        }
        const adults = Object.values(bot.entities || {}).filter(e => e.isValid && e.name === species &&
            here.distanceTo(e.position) <= 16 && !c.memory.breeding?.fed?.includes(e.id) && c.canSee(e))
            .sort((a, b) => here.distanceTo(a.position) - here.distanceTo(b.position))
        if (adults.length >= 2) {
            return { species, foods, pair: adults.slice(0, 2) }
        }
    }
    return null
}

function breedingState(c, state) {
    state.canBreed = Boolean(!state.completedAdvancements?.has('minecraft:husbandry/breed_an_animal') && state.dimension === 'overworld' &&
        !state.underground && !state.isNight && state.hostileDistance > 16 && !backedOff(c.memory.breeding) && breedingPair(c))
    return state
}

// The Parrots and the Bats: feed two adults of one species. A baby ignores breeding food,
// so fed ids are remembered and a failed pair is not retried.
async function breedAnimals(c) {
    const bot = c.bot
    const memory = c.memory.breeding ??= { failures: 0, at: 0, fed: [] }
    const found = breedingPair(c)
    try {
        if (!found) {
            throw new Error('no breedable pair in range')
        }
        for (const animal of found.pair) {
            c.checkAction()
            memory.fed.push(animal.id)
            const p = animal.position.floored()
            await c.gotoWithTimeout(new goals.GoalNear(p.x, p.y, p.z, 2), 10000, `${found.species} approach`)
            await bot.equip(c.bestItem(found.foods), 'hand')
            await bot.lookAt(animal.position.offset(0, 0.5, 0), true)
            await bot.activateEntity(animal)
        }
        await until(c, () => c.advancements.completed.has('minecraft:husbandry/breed_an_animal'), 8000)
        c.log.info(`Bred two ${found.species}s; The Parrots and the Bats confirmed by the server.`)
        memory.failures = 0
    } catch (error) {
        memory.failures += 1
        memory.at = Date.now()
        memory.fed = memory.fed.slice(-32)
        throw error
    }
}

module.exports = { farmingState, fishingState, breedingState, plantSeed, goFish, breedAnimals, SEEDS }
