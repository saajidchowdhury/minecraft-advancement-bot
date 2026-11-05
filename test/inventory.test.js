'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { discardableStack } = require('../src/inventory')

test('inventory cleanup keeps building reserves, ore, tools, food and rare items', () => {
    const valuable = [
        { name: 'diamond', count: 64 }, { name: 'iron_ingot', count: 64 },
        { name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 64 },
        { name: 'dirt', count: 64 }, { name: 'bread', count: 64 }, { name: 'diamond_pickaxe', count: 1 }
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

test('real inventory cleanup retreats beyond pickup range after tossing surplus', async () => {
    const { Vec3 } = require('vec3')
    const { performProgression } = require('../src/progression-skills')
    const origin = new Vec3(0.5, 64, 0.5)
    const full = { name: 'cobblestone', count: 64 }
    const inventory = [full, { ...full }, { ...full }]
    const original = {}
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), memory: {}, movements: original,
        log: { info() {} },
        bot: {
            health: 20, game: { dimension: 'overworld' }, registry: require('minecraft-data')('26.1'), entity: { position: origin.clone() },
            inventory: { items: () => inventory },
            blockAt(p) {
                const solid = p.y < 64 || p.y >= 67 || p.x > 0 || p.z !== 0
                return { name: solid ? 'stone' : 'air', position: p, boundingBox: solid ? 'block' : 'empty' }
            },
            async tossStack(item) { inventory.splice(inventory.indexOf(item), 1) },
            lookAt: async () => {},
            pathfinder: { setGoal() {}, setMovements(m) { c.activeMovements = m } }
        },
        async gotoWithTimeout(goal) {
            assert.equal(c.activeMovements.canDig, false)
            c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        }
    }
    await performProgression(c, 'clear_inventory', {})
    assert.ok(c.bot.entity.position.distanceTo(origin) >= 3)
    assert.equal(inventory.length, 2)
    assert.equal(c.activeMovements, original)
    const firstDrop = origin.clone()
    const afterFirst = c.bot.entity.position.clone()
    inventory.push({ ...full })
    await performProgression(c, 'clear_inventory', {})
    assert.ok(c.bot.entity.position.distanceTo(afterFirst) >= 3)
    assert.ok(c.bot.entity.position.distanceTo(firstDrop) >= 4)
})

test('cleanup refuses to toss in an enclosed cell with no safe retreat', async () => {
    const { Vec3 } = require('vec3')
    const { performProgression } = require('../src/progression-skills')
    let tossed = false
    const c = {
        memory: {},
        bot: {
            game: { dimension: 'overworld' },
            entity: { position: new Vec3(0.5, 64, 0.5) },
            inventory: { items: () => Array.from({ length: 3 }, () => ({ name: 'cobblestone', count: 64 })) },
            blockAt: () => ({ name: 'stone', boundingBox: 'block' }),
            async tossStack() { tossed = true }
        }
    }
    await assert.rejects(performProgression(c, 'clear_inventory', {}), /no supported disposal retreat/)
    assert.equal(tossed, false)
})
