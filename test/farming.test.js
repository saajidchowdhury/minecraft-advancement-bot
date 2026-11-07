'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { farmingState, plantSeed } = require('../src/farming')
const { chooseAction } = require('../src/decision-engine')

function farm(items) {
    const blocks = new Map([[new Vec3(1, 63, 0).toString(), 'grass_block']])
    const completed = new Set()
    const used = []
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), memory: {}, log: { info() {} },
        advancements: { completed },
        visibleDrops: () => Object.values(c.bot.entities || {}),
        hasItem: name => items.includes(name), hasAnyItem: names => names.some(n => items.includes(n)),
        countItems: () => 4, bestItem: names => ({ name: names.find(n => items.includes(n)) }),
        checkAction() {}, ensurePlanks: async () => {}, ensureItem: async name => items.push(name), collectTarget: async () => {},
        findNearestBlock(match, range, options = {}) {
            const p = new Vec3(1, 63, 0)
            const block = c.bot.blockAt(p)
            return match(block.name) && (!options.filter || options.filter(block)) ? block : null
        },
        bot: {
            entity: { position: new Vec3(0.5, 64, 0.5) },
            blockAt: p => ({ name: blocks.get(p.toString()) || (p.y >= 64 ? 'air' : 'stone'), position: p }),
            equip: async item => used.push(item.name), lookAt: async () => {},
            async activateBlock(block) {
                if (used.at(-1).endsWith('_hoe')) {
                    blocks.set(block.position.toString(), 'farmland')
                } else if (block.name === 'farmland') {
                    blocks.set(block.position.offset(0, 1, 0).toString(), 'wheat')
                    completed.add('minecraft:husbandry/plant_seed')
                }
            }
        }
    }
    return { c, blocks, used }
}

test('planting breaks collision-free grass itself and picks up the dropped seeds', async () => {
    const { c, blocks } = farm([])
    const grassAt = new Vec3(2, 64, 0)
    blocks.set(grassAt.toString(), 'short_grass')
    const items = c.__items = []
    c.hasAnyItem = names => names.some(n => items.includes(n))
    c.findNearestBlock = (match, range, options = {}) => {
        for (const p of [grassAt, new Vec3(1, 63, 0)]) {
            const block = c.bot.blockAt(p)
            if (match(block.name) && (!options.filter || options.filter(block))) {
                return block
            }
        }
        return null
    }
    c.gotoWithTimeout = async (goal, ms, label) => { if (label === 'seed pickup') { items.push('wheat_seeds') } }
    c.bot.entities = {}
    c.bot.waitForTicks = async () => {}
    c.bot.dig = async block => {
        blocks.set(block.position.toString(), 'air')
        c.bot.entities[1] = { name: 'item', isValid: true, position: block.position.offset(0.5, 0, 0.5) }
    }
    c.hasItem = name => items.includes(name)
    c.ensureItem = async name => items.push(name)
    c.bestItem = names => ({ name: names.find(n => items.includes(n)) })
    await plantSeed(c)
    assert.equal(blocks.get(grassAt.toString()), 'air')
    assert.equal(blocks.get(new Vec3(1, 64, 0).toString()), 'wheat')
})

test('planting crafts a hoe if needed, tills soil and plants seeds until the server confirms', async () => {
    const { c, blocks, used } = farm(['wheat_seeds'])
    await plantSeed(c)
    assert.equal(blocks.get(new Vec3(1, 63, 0).toString()), 'farmland')
    assert.equal(blocks.get(new Vec3(1, 64, 0).toString()), 'wheat')
    assert.deepEqual(used, ['wooden_hoe', 'wheat_seeds'])
})

test('planting is skipped once earned, at night, underground and after repeated failures', () => {
    const { c } = farm(['wheat_seeds'])
    const calm = { completedAdvancements: new Set(), dimension: 'overworld', underground: false, isNight: false,
        hostileDistance: Infinity, hasCraftingTable: true, planks: 4, logs: 0 }
    assert.equal(farmingState(c, { ...calm }).canPlantSeed, true)
    assert.equal(farmingState(c, { ...calm, completedAdvancements: new Set(['minecraft:husbandry/plant_seed']) }).canPlantSeed, false)
    assert.equal(farmingState(c, { ...calm, isNight: true }).canPlantSeed, false)
    assert.equal(farmingState(c, { ...calm, underground: true }).canPlantSeed, false)
    c.memory.planting = { failures: 3, at: Date.now() }
    assert.equal(farmingState(c, { ...calm }).canPlantSeed, false)
    assert.equal(chooseAction({ health: 20, food: 20, hostileDistance: Infinity, canPlantSeed: true, cobblestone: 0, logs: 0, planks: 0, sticks: 0 }), 'plant_seed')
})

test('fishing crafts a rod, walks to open water and casts until the server confirms Fishy Business', async () => {
    const { fishingState, goFish } = require('../src/farming')
    const items = ['string']
    const completed = new Set()
    const water = { name: 'water', position: new Vec3(5, 62, 0), getProperties: () => ({ level: 0 }) }
    const calls = []
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), memory: {}, log: { info() {} },
        advancements: { completed }, checkAction() {},
        visibleDrops: () => Object.values(c.bot.entities || {}),
        hasItem: name => items.includes(name), countItems: names => names.includes('string') ? 3 : 4,
        bestItem: names => ({ name: names[0] }), ensurePlanks: async () => {}, ensureItem: async name => { items.push(name); calls.push(`craft ${name}`) },
        findNearestBlock: (match, range, options) => match('water') && options.filter(water) ? water : null,
        async gotoWithTimeout(goal, ms, label) { calls.push(label) },
        bot: {
            blockAt: p => ({ name: p.y >= 63 ? 'air' : 'water', position: p }),
            equip: async () => {}, lookAt: async () => {}, activateItem() {},
            async fish() { calls.push('cast'); completed.add('minecraft:husbandry/fishy_business') }
        }
    }
    const calm = { completedAdvancements: completed, dimension: 'overworld', underground: false, isNight: false,
        hostileDistance: Infinity, hasCraftingTable: true, sticks: 4, planks: 0, logs: 0 }
    assert.equal(fishingState(c, { ...calm }).canFish, true)
    await goFish(c)
    assert.deepEqual(calls, ['craft fishing_rod', 'fishing spot', 'cast'])
    assert.equal(fishingState(c, { ...calm }).canFish, false)
})

test('unreachable grass is remembered and skipped so other grass can supply seeds', async () => {
    const { c, blocks } = farm([])
    const far = new Vec3(9, 64, 9)
    const near = new Vec3(2, 64, 0)
    blocks.set(far.toString(), 'short_grass')
    blocks.set(near.toString(), 'short_grass')
    const items = []
    const blocked = new Set()
    c.hasAnyItem = names => names.some(n => items.includes(n))
    c.hasItem = name => items.includes(name)
    c.ensureItem = async name => items.push(name)
    c.bestItem = names => ({ name: names.find(n => items.includes(n)) })
    c.rememberBlockedTarget = block => blocked.add(block.position.toString())
    c.findNearestBlock = (match, range, options = {}) => {
        for (const p of [far, near, new Vec3(1, 63, 0)]) {
            const block = c.bot.blockAt(p)
            if (!blocked.has(p.toString()) && match(block.name) && (!options.filter || options.filter(block))) {
                return block
            }
        }
        return null
    }
    c.gotoWithTimeout = async (goal, ms, label) => {
        if (label === 'seed grass' && goal.x === 9) {
            throw new Error('seed grass timed out after 8s')
        }
        if (label === 'seed pickup') {
            items.push('wheat_seeds')
        }
    }
    c.bot.entities = {}
    c.bot.waitForTicks = async () => {}
    c.bot.dig = async block => {
        blocks.set(block.position.toString(), 'air')
        c.bot.entities[1] = { name: 'item', isValid: true, position: block.position.offset(0.5, 0, 0.5) }
    }
    await plantSeed(c)
    assert.ok(blocked.has(far.toString()))
    assert.equal(blocks.get(near.toString()), 'air')
    assert.equal(blocks.get(new Vec3(1, 64, 0).toString()), 'wheat')
})

test('breeding feeds two nearby adults of one species with their tag food until the server confirms', async () => {
    const { breedingState, breedAnimals } = require('../src/farming')
    const completed = new Set()
    const fed = []
    const hen = (id, x) => ({ id, name: 'chicken', isValid: true, position: new Vec3(x, 64, 0) })
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), memory: {}, log: { info() {} },
        advancements: { completed }, checkAction() {}, canSee: () => true,
        hasAnyItem: names => names.includes('wheat_seeds'), bestItem: names => ({ name: names[0] }),
        async gotoWithTimeout() {},
        bot: {
            entity: { position: new Vec3(0, 64, 0) },
            entities: { 1: hen(1, 3), 2: hen(2, 5), 3: { id: 3, name: 'cow', isValid: true, position: new Vec3(2, 64, 0) } },
            equip: async () => {}, lookAt: async () => {},
            async activateEntity(e) { fed.push(e.id); if (fed.length === 2) { completed.add('minecraft:husbandry/breed_an_animal') } }
        }
    }
    const calm = { completedAdvancements: completed, dimension: 'overworld', underground: false, isNight: false, hostileDistance: Infinity }
    assert.equal(breedingState(c, { ...calm }).canBreed, true)
    await breedAnimals(c)
    assert.deepEqual(fed, [1, 2])
    assert.equal(breedingState(c, { ...calm }).canBreed, false)
    c.hasAnyItem = () => false
    completed.clear()
    assert.equal(breedingState(c, { ...calm }).canBreed, false)
})
