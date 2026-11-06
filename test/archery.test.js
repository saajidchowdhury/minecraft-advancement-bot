'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { archeryState, shootArrow, aimPoint, clearShot } = require('../src/archery')

const TAKE_AIM = 'minecraft:adventure/shoot_arrow'

function scene({ inventory = {}, entities = [], completed = new Set() } = {}) {
    const self = { type: 'player', position: new Vec3(0.5, 64, 0.5), height: 1.62 }
    const bot = { entity: self, entities: { 0: self }, inventory: { items: () => [] } }
    entities.forEach((e, i) => { bot.entities[i + 1] = { isValid: true, height: 0.9, ...e } })
    return {
        bot, memory: {}, advancements: { completed }, log: { info() {} },
        hasItem: name => (inventory[name] || 0) > 0,
        countItems: names => names.reduce((sum, name) => sum + (inventory[name] || 0), 0),
        isBlockedTarget: () => false
    }
}

const calm = { completedAdvancements: new Set(), dimension: 'overworld', underground: false, isNight: false,
    hostileDistance: Infinity, hasCraftingTable: true, sticks: 0, planks: 2, logs: 0 }

test('aim rises by the ballistic drop over the flight time', () => {
    const eye = new Vec3(0, 65.62, 0)
    const cow = { position: new Vec3(12, 64, 0), height: 1.4 }
    const aim = aimPoint(eye, cow)
    const ticks = eye.distanceTo(new Vec3(12, 64.7, 0)) / 3
    assert.ok(Math.abs(aim.y - (64.7 + 0.025 * ticks * ticks)) < 1e-9)
    assert.ok(aim.y > 64.7 + 0.3)
})

test('a player near the arrow path or just behind the target blocks the shot', () => {
    const cow = { position: new Vec3(10.5, 64, 0.5) }
    for (const [x, z, clear] of [[5, 1, false], [12, 0.5, false], [5, 6, true], [-6, 0.5, true]]) {
        const c = scene({ entities: [{ type: 'player', position: new Vec3(x, 64, z) }] })
        assert.equal(clearShot(c.bot, cow), clear, `player at ${x},${z}`)
    }
})

test('Take Aim waits for calm daylight, bow and arrow materials and a passive target in range', () => {
    const ready = { inventory: { string: 3, flint: 1, feather: 1 }, entities: [{ name: 'cow', position: new Vec3(9, 64, 0) }] }
    assert.equal(archeryState(scene(ready), { ...calm }).canShootArrow, true)
    for (const change of [{ isNight: true }, { underground: true }, { hostileDistance: 10 },
        { completedAdvancements: new Set([TAKE_AIM]) }, { planks: 0 }]) {
        assert.equal(archeryState(scene(ready), { ...calm, ...change }).canShootArrow, false, JSON.stringify(change))
    }
    assert.equal(archeryState(scene({ ...ready, inventory: { string: 2, flint: 1, feather: 1 } }), { ...calm }).canShootArrow, false)
    assert.equal(archeryState(scene({ ...ready, inventory: { bow: 1, arrow: 4 } }), { ...calm, planks: 0 }).canShootArrow, true)
    for (const e of [{ name: 'cow', position: new Vec3(2, 64, 0) }, { name: 'cow', position: new Vec3(20, 64, 0) },
        { name: 'villager', position: new Vec3(9, 64, 0) }, { name: 'iron_golem', position: new Vec3(9, 64, 0) }]) {
        assert.equal(archeryState(scene({ ...ready, entities: [e] }), { ...calm }).canShootArrow, false, e.name)
    }
})

test('a shot crafts bow and arrows, draws fully before release and stops on the server advancement', async () => {
    const inventory = { string: 3, flint: 1, feather: 1, stick: 0, oak_planks: 2 }
    const c = scene({ inventory, entities: [{ name: 'pig', position: new Vec3(9, 64, 0), velocity: new Vec3(0, 0, 0) }] })
    const events = []
    let ticks = 0
    Object.assign(c.bot, {
        async equip(item) { events.push(`equip:${item.name}`) },
        async lookAt() {},
        async waitForTicks(n) { ticks += n },
        activateItem() { ticks = 0; events.push('draw') },
        deactivateItem() {
            events.push(`release@${ticks}`)
            c.advancements.completed.add(TAKE_AIM)
        }
    })
    Object.assign(c, {
        running: true, paused: false, checkAction() {},
        bestItem: names => ({ name: names[0] }),
        async ensurePlanks() {},
        async ensureItem(name, count) { events.push(`craft:${name}`); inventory[name] = Math.max(inventory[name] || 0, count) }
    })
    await shootArrow(c)
    assert.deepEqual(events.slice(0, 3), ['craft:stick', 'craft:bow', 'craft:arrow'])
    const releases = events.filter(e => e.startsWith('release@'))
    assert.equal(releases.length, 1)
    assert.ok(Number(releases[0].split('@')[1]) >= 20)
    assert.equal(c.memory.archery.failures, 0)
})

test('the planner takes a ready shot only when no tool preparation or survival need comes first', () => {
    const { chooseAction } = require('../src/decision-engine')
    const base = { health: 20, food: 20, hostileDistance: Infinity, hasCraftingTable: true, hasWoodenPickaxe: true,
        hasEarlySword: true, hasStonePickaxe: true, hasWoodcuttingAxe: true, hasDiggingShovel: true, hasFurnace: true, hasIronPickaxe: true, ironIngots: 0, rawIron: 0,
        logs: 8, planks: 4, sticks: 4, cobblestone: 16, foodUnits: 24, canShootArrow: true }
    assert.equal(chooseAction(base), 'shoot_arrow')
    assert.notEqual(chooseAction({ ...base, food: 4 }), 'shoot_arrow')
    assert.notEqual(chooseAction({ ...base, hasWoodcuttingAxe: false }), 'shoot_arrow')
})
