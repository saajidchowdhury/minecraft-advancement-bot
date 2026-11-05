'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { discardableStack, discardableStacks } = require('../src/inventory')

test('inventory cleanup keeps building reserves, ore, tools, food and rare items', () => {
    const valuable = [
        { name: 'diamond', count: 64 }, { name: 'iron_ingot', count: 64 },
        { name: 'cobblestone', count: 64 }, { name: 'cobbled_deepslate', count: 64 },
        { name: 'dirt', count: 16 }, { name: 'bread', count: 64 }, { name: 'diamond_pickaxe', count: 1 }
    ]
    assert.equal(discardableStack(valuable), null)
    const surplus = { name: 'cobblestone', count: 64 }
    assert.equal(discardableStack([...valuable, surplus]).name, 'cobblestone')
})

test('cleanup frees a full surplus rubble stack before discarding a tiny partial stack', () => {
    const small = { name: 'cobblestone', count: 1 }
    const full = { name: 'cobblestone', count: 64 }
    const items = [small, full, { ...full }, { ...full }]
    assert.equal(discardableStack(items), full)
})

test('one cleanup selects every surplus rubble stack while keeping each reserve', () => {
    const items = [
        ...Array.from({ length: 3 }, () => ({ name: 'cobblestone', count: 64 })), { name: 'cobblestone', count: 31 },
        { name: 'cobbled_deepslate', count: 64 }, { name: 'cobbled_deepslate', count: 48 }, { name: 'granite', count: 18 },
        { name: 'dirt', count: 64 }, { name: 'dirt', count: 17 }, { name: 'raw_iron', count: 15 }
    ]
    const surplus = discardableStacks(items)
    const left = name => items.filter(i => i.name === name && !surplus.includes(i)).reduce((n, i) => n + i.count, 0)
    assert.equal(left('cobblestone'), 64)
    assert.equal(left('cobbled_deepslate'), 64)
    assert.equal(left('dirt'), 17)
    assert.equal(left('granite'), 0)
    assert.equal(left('raw_iron'), 15)
    assert.equal(surplus.length, 6)
})

function disposalContext(open, inventory, route = []) {
    const { Vec3 } = require('vec3')
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), memory: { mineRoute: route }, movements: {},
        log: { info() {}, warn() {} }, tossed: [], looks: [], ticks: 0,
        bot: {
            health: 20, game: { dimension: 'overworld' }, registry: require('minecraft-data')('26.1'),
            entity: { position: new Vec3(0.5, 64, 0.5) },
            inventory: { items: () => inventory },
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
