'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { nextAdvancement, EXPEDITION_BLOCKS } = require('../src/advancement-plan')
const { heading, chooseTarget, findFortress } = require('../src/nether-fortress')
const { discardableStacks } = require('../src/inventory')

const entered = new Set(['minecraft:story/lava_bucket', 'minecraft:story/shiny_gear', 'minecraft:story/enter_the_nether'])
// The whole earlier route is done: iron and diamond tools, iron armor, buckets and the portal.
const kit = {
    logs: 0, planks: 8, sticks: 4, cobblestone: 256, ironIngots: 6, rawIron: 0, hasCraftingTable: true, carriesCraftingTable: true,
    hasWoodenPickaxe: true, hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true, hasDiamondPickaxe: true,
    hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true, hasBucket: true, buckets: 3,
    emptyBuckets: 1, waterBuckets: 2, hasFlintAndSteel: true, diamonds: 0, obsidian: 0, flint: 0, redstone: 0, foodUnits: 24,
    hasSmeltingFuel: true, dimension: 'overworld', completedAdvancements: entered, items: {},
    gear: new Set(['diamond_sword', 'diamond_pickaxe', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'shield']),
    bridgeSupply: EXPEDITION_BLOCKS, netherMealsReady: true, netherMealsLeft: true
}

test('after the first Nether entry the bot stocks blocks, spare pickaxe iron and food, then goes back', () => {
    const step = changes => nextAdvancement({ ...kit, ...changes })
    assert.equal(step({ carriesCraftingTable: false }).action, 'craft_table')
    assert.equal(step({ bridgeSupply: 255 }).action, 'gather_stone')
    assert.notEqual(step({ ironIngots: 3, rawIron: 3 }).action, 'enter_nether')
    assert.equal(step({ netherMealsReady: false }).action, 'gather_food')
    assert.equal(step({}).action, 'enter_nether')
})

test('in the Nether a supplied bot searches for a fortress, a short one returns and a finished one holds', () => {
    const step = changes => nextAdvancement({ ...kit, dimension: 'the_nether', ...changes })
    assert.equal(step({}).action, 'find_fortress')
    assert.equal(step({ bridgeSupply: 64 }).action, 'leave_nether', 'an unprepared first visit does not start a search')
    assert.equal(step({ bridgeSupply: 64, fortressSearch: true }).action, 'find_fortress')
    assert.equal(step({ bridgeSupply: 7, fortressSearch: true }).action, 'leave_nether')
    assert.equal(step({ netherMealsLeft: false, fortressSearch: true }).action, 'leave_nether')
    assert.equal(step({ fortressReached: true }).action, 'wait')
})

test('expedition carry limits keep four stacks of bridge blocks and their slabs', () => {
    const items = [...Array(5)].map(() => ({ name: 'cobblestone', count: 64 })).concat([{ name: 'cobblestone_slab', count: 64 }])
    assert.equal(discardableStacks(items).filter(i => i.name === 'cobblestone').length, 4)
    const kept = discardableStacks(items, { limits: { building: 320, slabs: 512 } })
    assert.deepEqual(kept, [])
    const mixed = [{ name: 'netherrack', count: 64 }, ...items.slice(0, 5)]
    assert.deepEqual(discardableStacks(mixed, { limits: { building: 320 } }).map(i => i.name), ['netherrack'])
})

test('a sighted fortress is approached one axis at a time', () => {
    const feet = new Vec3(0, 70, 0)
    assert.equal(heading(feet, null, 2), 2)
    assert.equal(heading(feet, new Vec3(10, 70, 5), 0), 0, 'keeps x while it closes the gap')
    assert.equal(heading(new Vec3(10, 70, 0), new Vec3(10, 70, 5), 0), 1, 'then turns onto z')
    assert.equal(heading(feet, new Vec3(-4, 70, 0), 1), 2, 'turns onto x when z is matched')
    assert.equal(heading(feet, new Vec3(0, 75, 0), 3), 3)
    const near = chooseTarget(feet, [new Vec3(6, 90, 0), new Vec3(12, 70, 0)])
    assert.deepEqual(near, new Vec3(12, 70, 0), 'a block at bridge height beats a nearer one far above')
})

// A real Movements-free world: netherrack floor at y=69 for x<=1, void beyond, slabs placed by clicks.
function bridgeWorld() {
    const registry = require('minecraft-data')('26.1')
    const Block = require('prismarine-block')(registry)
    const placed = new Map()
    const key = p => `${p.x},${p.y},${p.z}`
    const name = p => placed.get(key(p)) ?? (p.y === 69 && p.x <= 1 && p.z === 0 ? 'netherrack' : 'air')
    const blockAt = p => {
        const q = p.floored()
        const b = Block.fromStateId(registry.blocksByName[name(q)].defaultState, 0)
        b.position = q
        return b
    }
    const inventory = [{ name: 'cobblestone_slab', count: 64 }, { name: 'cobblestone', count: 64 }]
    const clicks = []
    const bot = {
        registry, game: { dimension: 'the_nether' }, entity: { position: new Vec3(0.5, 70, 0.5), onGround: true },
        inventory: { items: () => inventory }, blockAt, findBlocks: () => [], tool: { equipForBlock: async () => {} },
        equip: async () => {}, waitForTicks: () => new Promise(resolve => setImmediate(resolve)), lookAt: async () => {}, setControlState () {},
        async _placeBlockWithOptions (ref, face, options) {
            const at = ref.position.plus(face)
            clicks.push({ at, half: options.half })
            placed.set(key(at), options.half ? 'cobblestone_slab' : 'cobblestone')
        }
    }
    return { bot, placed, clicks, key }
}

test('bridging over a void lays a top-half floor and head-height bottom-half walls, then walks on', async () => {
    const { bot, placed, clicks, key } = bridgeWorld()
    let walks = 0
    bot.setControlState = (control, value) => {
        if (control === 'forward' && value && ++walks % 3 === 0) {
            bot.entity.position = bot.entity.position.offset(1, 0, 0)
        }
    }
    const memory = { netherBridge: { dimension: 'the_nether', dir: 0, steps: 0, lastCheck: 0, portal: new Vec3(0, 70, 0), target: null, turns: 0 } }
    const c = { bot, memory, rng: () => 0, log: { info () {}, warn () {} }, running: true, paused: false, actionAbort: new AbortController() }
    const run = findFortress(c)
    while (memory.netherBridge.steps < 3) {
        await new Promise(resolve => setTimeout(resolve, 5))
    }
    c.running = false
    await assert.rejects(run, /cancelled/)
    assert.ok(bot.entity.position.x >= 3.5)
    assert.equal(placed.get(key(new Vec3(2, 69, 0))), 'cobblestone_slab')
    assert.equal(clicks.find(click => click.at.equals(new Vec3(2, 69, 0))).half, 'top')
    for (const z of [1, -1]) {
        assert.equal(placed.get(key(new Vec3(2, 70, z))), 'cobblestone', `post starting the wall run at z=${z}`)
        assert.equal(placed.get(key(new Vec3(3, 71, z))), 'cobblestone_slab', `chained wall at head height at z=${z}`)
        assert.equal(clicks.find(click => click.at.equals(new Vec3(3, 71, z))).half, 'bottom')
        assert.equal(placed.has(key(new Vec3(3, 70, z))), false, 'no feet-level block once walls chain')
    }
})

test('on soul sand the bot steps ahead at its real feet level instead of digging its floor', async () => {
    const { bot, placed, key } = bridgeWorld()
    const registry = bot.registry
    const Block = require('prismarine-block')(registry)
    const blockAt = bot.blockAt
    // Soul sand floor at y=69 under the bot and ahead; the bot's feet sink to 69.875.
    bot.blockAt = p => {
        const q = p.floored()
        if (q.y === 69 && q.z === 0 && !placed.has(key(q))) {
            const b = Block.fromStateId(registry.blocksByName.soul_sand.defaultState, 0)
            b.position = q
            return b
        }
        return blockAt(p)
    }
    bot.entity.position = new Vec3(0.5, 69.875, 0.5)
    const dug = []
    bot.dig = async block => { dug.push(block.position); await new Promise(resolve => setImmediate(resolve)) }
    bot.setControlState = (control, value) => {
        if (control === 'forward' && value) {
            bot.entity.position = bot.entity.position.offset(1, 0, 0)
        }
    }
    const memory = { netherBridge: { dimension: 'the_nether', dir: 0, steps: 0, lastCheck: 0, portal: new Vec3(0, 70, 0), target: null, turns: 0 } }
    const c = { bot, memory, rng: () => 0, log: { info () {}, warn () {} }, running: true, paused: false, actionAbort: new AbortController() }
    const run = findFortress(c)
    while (memory.netherBridge.steps < 2) {
        await new Promise(resolve => setTimeout(resolve, 5))
    }
    c.running = false
    await assert.rejects(run, /cancelled/)
    assert.deepEqual(dug, [], 'nothing dug: the cells ahead at y=70 are open')
    assert.equal(Math.floor(bot.entity.position.y), 69)
})

test('slab crafting puts the table beside the line and takes it back', async () => {
    const { bot, placed, key } = bridgeWorld()
    bot.inventory.items().push({ name: 'crafting_table', count: 1 })
    bot.inventory.items()[0].count = 0
    bot.blockAt = (original => p => {
        const q = p.floored()
        if (placed.get(key(q)) === 'crafting_table') {
            return { name: 'crafting_table', position: q, boundingBox: 'block' }
        }
        return original(p)
    })(bot.blockAt)
    bot._placeBlockWithOptions = async (ref, face) => { placed.set(key(ref.position.plus(face)), bot.heldName) }
    bot.equip = async item => { bot.heldName = item.name }
    // Netherrack floor all around so every side spot is valid; the line heads +x.
    const ground = bot.blockAt
    bot.blockAt = p => (p.floored().y === 69 && !placed.has(key(p.floored())) ? { ...ground(new Vec3(0, 69, 0)), position: p.floored() } : ground(p))
    const dug = []
    bot.dig = async block => { dug.push(block.position); placed.delete(key(block.position)) }
    const crafted = []
    const c = { bot, memory: {}, log: { info () {}, warn () {} }, running: true, paused: false, actionAbort: new AbortController(),
        craftItem: async (name, count) => { crafted.push([name, count, [...placed.entries()].find(([, v]) => v === 'crafting_table')?.[0]]) } }
    const memory = { netherBridge: { dimension: 'the_nether', dir: 0, steps: 0, lastCheck: 0, portal: new Vec3(0, 70, 0), target: null, turns: 0 } }
    c.memory = memory
    bot.setControlState = () => { c.running = false }
    await assert.rejects(findFortress(c))
    assert.equal(crafted.reduce((n, [, count]) => n + count, 0), 126, 'one stack of 63 blocks becomes 126 slabs')
    assert.ok(crafted.every(([name, count, table]) => name === 'cobblestone_slab' && count <= 24 && table === '0,70,1'),
        'small batches at a table beside the line')
    assert.deepEqual(dug.map(p => key(p)), ['0,70,1'])
})

test('a cancelled fortress step lets go well inside the 2 s release window', async () => {
    const { bot } = bridgeWorld()
    const memory = { netherBridge: { dimension: 'the_nether', dir: 0, steps: 0, lastCheck: 0, portal: new Vec3(0, 70, 0), target: null, turns: 0 } }
    const c = { bot, memory, rng: () => 0, log: { info () {}, warn () {} }, running: true, paused: false, actionAbort: new AbortController() }
    const started = Date.now()
    const run = findFortress(c)
    setTimeout(() => c.actionAbort.abort('nearby hostile'), 100)
    await assert.rejects(run, /cancelled/)
    assert.ok(Date.now() - started < 1000, `released after ${Date.now() - started} ms`)
})
