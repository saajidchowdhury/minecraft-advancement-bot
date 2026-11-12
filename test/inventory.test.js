'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { discardableStack, discardableStacks } = require('../src/inventory')

const foods = require('minecraft-data')('26.1').foodsByName

test('inventory cleanup keeps one mixed stone reserve, dirt, ore, tools, food and rare items', () => {
    const valuable = [
        { name: 'diamond', count: 64 }, { name: 'iron_ingot', count: 64 }, { name: 'cobblestone', count: 64 },
        { name: 'dirt', count: 16 }, { name: 'bread', count: 64 }, { name: 'diamond_pickaxe', count: 1 }
    ]
    assert.equal(discardableStack(valuable, { foods }), null)
    const surplus = { name: 'cobbled_deepslate', count: 64 }
    assert.equal(discardableStack([...valuable, surplus], { foods }), surplus)
})

test('cleanup throws whole surplus rubble stacks and keeps one stack-sized reserve', () => {
    const small = { name: 'cobblestone', count: 1 }
    const full = { name: 'cobblestone', count: 64 }
    const items = [small, full, { ...full }, { ...full }]
    const surplus = discardableStacks(items)
    assert.equal(surplus.length, 3)
    assert.ok(surplus.includes(small))
    assert.equal(items.filter(item => !surplus.includes(item)).reduce((n, item) => n + item.count, 0), 64)
})

test('one cleanup leaves at least 64 stone building blocks in total, 16 dirt and no stone variants', () => {
    const items = [
        ...Array.from({ length: 3 }, () => ({ name: 'cobblestone', count: 64 })), { name: 'cobblestone', count: 31 },
        { name: 'cobbled_deepslate', count: 64 }, { name: 'cobbled_deepslate', count: 48 }, { name: 'granite', count: 18 },
        { name: 'dirt', count: 64 }, { name: 'dirt', count: 17 }, { name: 'raw_iron', count: 15 }
    ]
    const surplus = discardableStacks(items)
    const left = name => items.filter(i => i.name === name && !surplus.includes(i)).reduce((n, i) => n + i.count, 0)
    assert.equal(left('dirt'), 64)
    assert.equal(left('cobblestone') + left('cobbled_deepslate'), 64)
    assert.equal(left('granite'), 0)
    assert.equal(left('raw_iron'), 15)
    assert.equal(surplus.length, 7)
})

// The 06:42Z inventory (35 of 36 slots) whose cleanups ran after every tunnel segment.
const LIVE = [['coal', 35], ['iron_leggings', 1], ['birch_log', 6], ['diamond', 2], ['oak_sapling', 6], ['redstone', 4],
    ['furnace', 1], ['raw_copper', 27], ['wooden_pickaxe', 1], ['raw_iron', 7], ['stone_pickaxe', 1], ['bucket', 1],
    ['iron_chestplate', 1], ['oak_log', 20], ['dirt', 29], ['gunpowder', 1], ['crafting_table', 1], ['birch_planks', 2],
    ['iron_ingot', 2], ['leather', 1], ['stone_axe', 1], ['cobbled_deepslate', 64], ['lapis_lazuli', 17], ['stick', 2],
    ['stone_shovel', 1], ['string', 2], ['diamond_sword', 1], ['cooked_beef', 9], ['cobblestone', 59], ['cobblestone', 1],
    ['lava_bucket', 1], ['torch', 6], ['iron_sword', 1], ['diamond_pickaxe', 1], ['iron_pickaxe', 1]]
    .map(([name, count]) => ({ name, count }))
const LIVE_WORN = ['iron_helmet', 'diamond_chestplate', 'diamond_leggings', 'iron_boots', 'shield']

test('the 06:42Z inventory throws junk, copper, gunpowder, outclassed gear and surplus rubble (10 slots)', () => {
    const surplus = discardableStacks(LIVE, { worn: LIVE_WORN, foods })
    assert.deepEqual(surplus.map(item => `${item.name} ${item.count}`).sort(), [
        'cobblestone 1', 'cobblestone 59', 'gunpowder 1', 'iron_chestplate 1', 'iron_leggings 1', 'iron_sword 1',
        'oak_sapling 6', 'raw_copper 27', 'stone_pickaxe 1', 'wooden_pickaxe 1'])
})

test('cleanup waits until two or fewer slots are free unless the pack is completely full', () => {
    const { needsCleanup } = require('../src/inventory')
    const junk = { name: 'raw_copper', count: 1 }
    assert.equal(needsCleanup(4, junk), false, 'four free slots re-triggered after every tunnel segment')
    assert.equal(needsCleanup(3, junk), false)
    assert.equal(needsCleanup(2, junk), true)
    assert.equal(needsCleanup(2, null), false)
    assert.equal(needsCleanup(0, null), true)
})

function disposalContext(open, inventory, route = []) {
    const { Vec3 } = require('vec3')
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), memory: { mineRoute: route }, movements: {},
        log: { info() {}, warn() {} }, tossed: [], looks: [], ticks: 0,
        bot: {
            health: 20, game: { dimension: 'overworld' }, registry: require('minecraft-data')('26.1'),
            entity: { position: new Vec3(0.5, 64, 0.5) },
            inventory: { items: () => inventory, emptySlotCount: () => 36 - inventory.length },
            blockAt(p) {
                const air = p.y >= 64 && p.y < 66 && open(p.x, p.z)
                return { name: air ? 'air' : 'stone', position: p, boundingBox: air ? 'empty' : 'block' }
            },
            async tossStack(item) {
                assert.ok(c.ticks >= 2, 'rotation must be transmitted before throwing')
                c.tossed.push(item)
                inventory.splice(inventory.indexOf(item), 1)
            },
            async lookAt(p) { c.looks.push(p) },
            async waitForTicks(n) { c.ticks += n },
            chat() {},
            pathfinder: { setGoal() {}, setMovements(m) { c.activeMovements = m } }
        },
        async gotoWithTimeout(goal) {
            c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        }
    }
    return c
}

test('cleanup clears the incidental stacks from the stalled LAN inventory', async () => {
    const { performProgression } = require('../src/progression-skills')
    const inventory = [
        { name: 'cobblestone', count: 64 }, { name: 'dirt', count: 41 }, { name: 'gravel', count: 1 },
        { name: 'mushroom_stew', count: 1 }, { name: 'iron_pickaxe', count: 1 }, { name: 'raw_iron', count: 2 },
        { name: 'azalea', count: 1 }, { name: 'leaf_litter', count: 2 }, { name: 'moss_block', count: 7 },
        { name: 'red_mushroom', count: 1 }, { name: 'brown_mushroom', count: 1 }, { name: 'bowl', count: 1 },
        { name: 'birch_sapling', count: 1 }
    ]
    const c = disposalContext((x, z) => x === 0 && z >= 0 && z <= 8, inventory)
    await performProgression(c, 'clear_inventory', {})
    assert.deepEqual(inventory.map(item => item.name), ['cobblestone', 'dirt', 'gravel', 'mushroom_stew', 'iron_pickaxe', 'raw_iron'])
    assert.equal(c.paused, false)
    assert.equal(c.memory.paused, undefined)
})

test('cleanup leaves protected items alone when there is already space', async () => {
    const { performProgression } = require('../src/progression-skills')
    const inventory = [{ name: 'cobblestone', count: 64 }, { name: 'diamond', count: 1 }]
    const c = disposalContext(() => false, inventory)
    await performProgression(c, 'clear_inventory', {})
    assert.equal(c.paused, false)
    assert.equal(c.memory.paused, undefined)
    assert.equal(c.tossed.length, 0)
})

test('a full inventory throws one low-priority stack even when it has no routine surplus', async () => {
    const { performProgression } = require('../src/progression-skills')
    const spare = { name: 'raw_copper', count: 7 }
    const inventory = [
        { name: 'mushroom_stew', count: 1 }, { name: 'iron_pickaxe', count: 1 },
        { name: 'cobblestone', count: 64 }, { name: 'diamond', count: 1 }, spare
    ]
    const c = disposalContext((x, z) => x === 0 && z >= 0 && z <= 8, inventory)
    c.bot.inventory.emptySlotCount = () => 5 - inventory.length
    await performProgression(c, 'clear_inventory', {})
    assert.deepEqual(c.tossed, [spare])
    assert.equal(c.bot.inventory.emptySlotCount(), 1)
    assert.equal(c.paused, false)
})

test('a full inventory with no safe toss route still releases one stack', async () => {
    const { performProgression } = require('../src/progression-skills')
    const spare = { name: 'leaf_litter', count: 2 }
    const inventory = [{ name: 'iron_pickaxe', count: 1 }, spare]
    const c = disposalContext((x, z) => x === 0 && z === 0, inventory)
    c.bot.inventory.emptySlotCount = () => 2 - inventory.length
    await performProgression(c, 'clear_inventory', {})
    assert.deepEqual(c.tossed, [spare])
    assert.equal(c.paused, false)
})

test('overflow uses a nearby owned chest when there is no safe toss route', async () => {
    const { performProgression } = require('../src/progression-skills')
    const spare = { name: 'leaf_litter', type: 10, count: 2 }
    const inventory = [{ name: 'iron_pickaxe', count: 1 }, spare]
    const c = disposalContext((x, z) => x === 0 && z === 0, inventory)
    c.bot.inventory.emptySlotCount = () => 2 - inventory.length
    c.memory.base = { dimension: 'overworld', chest: { x: 1, y: 64, z: 0 } }
    c.checkAction = () => {}
    const at = c.bot.blockAt
    c.bot.blockAt = p => p.x === 1 && p.y === 64 && p.z === 0 ? { name: 'chest', boundingBox: 'block' } : at(p)
    c.bot.openContainer = async block => {
        assert.equal(block.name, 'chest')
        return {
            async deposit(type, metadata, count) {
                assert.deepEqual([type, metadata, count], [spare.type, null, spare.count])
                inventory.splice(1, 1)
            },
            containerItems: () => [spare],
            close() {}
        }
    }
    await performProgression(c, 'clear_inventory', {})
    assert.equal(c.bot.inventory.emptySlotCount(), 1)
    assert.deepEqual(c.memory.base.contents, { leaf_litter: 2 })
    assert.equal(c.tossed.length, 0)
})

test('a dead-end tunnel throws all surplus back along the route without moving', async () => {
    const { performProgression } = require('../src/progression-skills')
    const full = () => ({ name: 'cobbled_deepslate', count: 64 })
    const inventory = [full(), full(), full(), { name: 'tuff', count: 3 }, { name: 'diamond', count: 2 }]
    // Live F015 geometry: one-wide tunnel along -z from the face at z=0 with stale nearby drops.
    const c = disposalContext((x, z) => x === 0 && z >= 0 && z <= 16, inventory, [{ x: 0, y: 64, z: 1 }])
    c.memory.lastDisposal = { x: 0, z: 1, dimension: 'overworld', at: Date.now() }
    const origin = c.bot.entity.position.clone()
    await performProgression(c, 'clear_inventory', {})
    assert.deepEqual(c.bot.entity.position, origin)
    assert.equal(c.tossed.length, 3)
    assert.deepEqual(inventory.map(i => i.name), ['cobbled_deepslate', 'diamond'])
    const look = c.looks[0].minus(origin)
    assert.ok(look.z > 3 && Math.abs(look.x) < 1e-9 && Math.abs(look.y - 1.62) < 1e-9)
    assert.equal(c.memory.disposalFailures, 0)
})

test('without a lane, cleanup tosses then retreats beyond pickup range', async () => {
    const { performProgression } = require('../src/progression-skills')
    const full = () => ({ name: 'cobblestone', count: 64 })
    const inventory = [full(), full(), full()]
    const c = disposalContext((x, z) => z === 0 && x <= 0 && x >= -3, inventory)
    const origin = c.bot.entity.position.clone()
    c.gotoWithTimeout = async goal => {
        assert.equal(c.activeMovements.canDig, false)
        c.bot.entity.position = new (require('vec3').Vec3)(goal.x + 0.5, goal.y, goal.z + 0.5)
    }
    await performProgression(c, 'clear_inventory', {})
    assert.ok(c.bot.entity.position.distanceTo(origin) >= 3)
    assert.equal(inventory.length, 1)
    assert.equal(c.activeMovements, c.movements)
})

test('cleanup refuses to toss in an enclosed cell with no lane or retreat', async () => {
    const { performProgression } = require('../src/progression-skills')
    const inventory = Array.from({ length: 3 }, () => ({ name: 'cobblestone', count: 64 }))
    const c = disposalContext((x, z) => x === 0 && z === 0, inventory)
    await assert.rejects(performProgression(c, 'clear_inventory', {}), /no open toss lane or supported disposal retreat/)
    assert.equal(c.tossed.length, 0)
})

test('repeated disposal failures back off for a bounded time instead of pausing indefinitely', async () => {
    const { performProgression } = require('../src/progression-skills')
    const inventory = []
    const c = disposalContext((x, z) => z === 0 && x <= 0 && x >= -3, inventory)
    c.gotoWithTimeout = async () => { throw new Error('simulated repeated physics stall') }
    for (let i = 0; i < 3; i++) {
        inventory.push(...Array.from({ length: 2 }, () => ({ name: 'cobblestone', count: 64 })))
        await assert.rejects(performProgression(c, 'clear_inventory', {}), /physics stall/)
        inventory.length = 0
        c.memory.lastDisposal = null
    }
    assert.equal(c.tossed.length, 3)
    assert.equal(c.paused, false)
    assert.ok(c.memory.disposalBackoffUntil > Date.now() + 50000)
    assert.equal(c.memory.disposalFailures, 0)
})

test('a descending staircase throws surplus up the carved steps instead of retreating', async () => {
    const { performProgression } = require('../src/progression-skills')
    const inventory = [{ name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 64 }, { name: 'granite', count: 9 }]
    const c = disposalContext(() => false, inventory, [{ x: 0, y: 65, z: 1 }])
    // Stair carved upward along +z: step k has open feet/head cells at y=64+k and 65+k, plus jump room above the bot.
    c.bot.blockAt = p => {
        const k = p.z
        const air = p.x === 0 && k >= 0 && k <= 6 && p.y >= 64 + k && p.y <= 65 + k + (k === 0 ? 1 : 0)
        return { name: air ? 'air' : 'stone', position: p, boundingBox: air ? 'empty' : 'block' }
    }
    const origin = c.bot.entity.position.clone()
    let moved = false
    c.gotoWithTimeout = async () => { moved = true }
    await performProgression(c, 'clear_inventory', {})
    assert.equal(moved, false)
    assert.deepEqual(c.bot.entity.position, origin)
    assert.deepEqual(inventory.map(i => i.name), ['cobblestone'])
    const look = c.looks[0].minus(origin)
    assert.ok(look.z === 4 && Math.abs(look.y - 5.62) < 1e-9 && look.x === 0)
})

test('cleanup digs a shielded pit beside the tunnel and throws surplus into it', async () => {
    const { Vec3 } = require('vec3')
    const { performProgression } = require('../src/progression-skills')
    const inventory = [{ name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 64 }, { name: 'tuff', count: 5 }]
    const c = disposalContext(() => false, inventory, [{ x: 0, y: 64, z: 1 }])
    const dug = new Set()
    // One-wide tunnel along +z from the face at z=0; everything else is diggable stone.
    c.bot.blockAt = p => {
        const air = dug.has(p.toString()) || (p.x === 0 && p.z >= 0 && p.y >= 64 && p.y <= 65)
        return { name: air ? 'air' : 'stone', position: p, boundingBox: air ? 'empty' : 'block', diggable: !air }
    }
    c.bot.dig = async block => { dug.add(block.position.toString()) }
    c.bestItem = () => undefined
    const origin = c.bot.entity.position.clone()
    await performProgression(c, 'clear_inventory', {})
    assert.deepEqual(c.bot.entity.position, origin)
    assert.equal(dug.size, 3)
    const side = [...dug].map(k => new Vec3(...k.slice(1, -1).split(',').map(Number)))
    const dx = Math.sign(side[0].x)
    assert.ok(dx !== 0 && side.every(p => p.z === 0))
    assert.deepEqual(side.map(String).sort(), [new Vec3(dx, 65, 0), new Vec3(2 * dx, 65, 0), new Vec3(2 * dx, 64, 0)].map(String).sort())
    assert.equal(c.bot.blockAt(new Vec3(dx, 64, 0)).boundingBox, 'block')
    assert.deepEqual(inventory.map(i => i.name), ['cobblestone'])
    const look = c.looks[0].minus(origin)
    assert.ok(look.x === 3 * dx && look.z === 0 && Math.abs(look.y - 1.62) < 1e-9)
})

test('no pit is dug next to liquid or under a loose roof', async () => {
    const { performProgression } = require('../src/progression-skills')
    for (const hazard of ['water', 'gravel']) {
        const inventory = [{ name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 64 }]
        const c = disposalContext(() => false, inventory)
        let digs = 0
        c.bot.blockAt = p => {
            const air = p.x === 0 && p.z === 0 && p.y >= 64 && p.y <= 65
            const ring = Math.abs(p.x) + Math.abs(p.z) === 2 && (p.x === 0 || p.z === 0)
            const name = air ? 'air' : ring && p.y === (hazard === 'water' ? 63 : 66) ? hazard : 'stone'
            return { name, position: p, boundingBox: air || name === 'water' ? 'empty' : 'block', diggable: !air }
        }
        c.bot.dig = async () => { digs++ }
        c.bestItem = () => undefined
        await assert.rejects(performProgression(c, 'clear_inventory', {}), /no open toss lane/)
        assert.equal(digs, 0)
    }
})

test('armor upgrades fill every slot with the best carried tier and never downgrade', () => {
    const { armorUpgrades } = require('../src/progression-skills')
    const items = [{ name: 'iron_helmet' }, { name: 'diamond_helmet' }, { name: 'iron_boots' }, { name: 'iron_leggings' }, { name: 'iron_chestplate' }]
    const slots = []
    slots[6] = { name: 'diamond_chestplate' }
    slots[7] = { name: 'golden_leggings' }
    const bot = { inventory: { items: () => items, slots } }
    const plan = armorUpgrades(bot).map(u => `${u.destination}:${u.item.name}`)
    assert.deepEqual(plan, ['head:diamond_helmet', 'legs:iron_leggings', 'feet:iron_boots'])
})

test('!inventory reports tools with durability first, then worn gear, then item counts within chat limits', () => {
    const { inventoryReport } = require('../src/inventory')
    const items = [
        { name: 'stone_pickaxe', count: 1, maxDurability: 131, durabilityUsed: 120 },
        { name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 30 },
        { name: 'diamond_pickaxe', count: 1, maxDurability: 1561, durabilityUsed: 61 },
        { name: 'iron_sword', count: 1, maxDurability: 250, durabilityUsed: 0 },
        { name: 'bread', count: 12 }, { name: 'bucket', count: 1 },
        ...Array.from({ length: 40 }, (_, i) => ({ name: `filler_block_number_${i}`, count: 1 }))
    ]
    const lines = inventoryReport(items, { head: { name: 'diamond_helmet', maxDurability: 363, durabilityUsed: 36 }, torso: null, offhand: { name: 'shield', maxDurability: 336, durabilityUsed: 0 } })
    assert.equal(lines[0], 'Tools: bucket, diamond_pickaxe 96%, stone_pickaxe 8%, iron_sword 100%')
    assert.equal(lines[1], 'Worn: head diamond_helmet 90%, offhand shield 100%')
    assert.ok(lines[2].startsWith('Items: 94 cobblestone, 12 bread'))
    assert.ok(lines.length <= 4 && lines.every(line => line.length <= 256))
    assert.match(lines.at(-1), /\+\d+ more$/)
    assert.deepEqual(inventoryReport([], {}), ['Tools: none', 'Worn: nothing', 'Items: none'])
})

test('cleanup merges split partial stacks before choosing what to throw', async () => {
    const { performProgression } = require('../src/progression-skills')
    const big = { name: 'cobblestone', count: 59, stackSize: 64, slot: 9 }
    const small = { name: 'cobblestone', count: 1, stackSize: 64, slot: 10 }
    const inventory = [big, small, { name: 'diamond', count: 1, stackSize: 64, slot: 11 }]
    const c = disposalContext(() => false, inventory)
    const moves = []
    c.bot.inventory.slots = { 9: big, 10: small }
    c.bot.moveSlotItem = async (from, to) => {
        moves.push([from, to])
        big.count += small.count
        inventory.splice(inventory.indexOf(small), 1)
    }
    await performProgression(c, 'clear_inventory', {})
    assert.deepEqual(moves, [[10, 9]])
    assert.equal(big.count, 60)
    assert.equal(c.tossed.length, 0)
})
