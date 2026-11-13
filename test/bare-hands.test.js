'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { pickaxeStranded, handDiggable } = require('../src/inventory')
const { mineTunnel, performProgression } = require('../src/progression-skills')
const { SurvivalController } = require('../src/survival-bot')

// Server-side inventory of the stuck bot at -4,31,-46 (F126): one plank, no sticks.
const STUCK = [['oak_planks', 1], ['cobblestone', 104], ['crafting_table', 2], ['stone_axe', 1], ['stone_shovel', 1],
    ['furnace', 1], ['coal', 21], ['dirt', 17], ['granite', 13], ['diorite', 13], ['gravel', 3]]
const stack = ([name, count]) => ({ name, count, type: 1 })
const stuck = extra => [...STUCK, ...extra].map(stack)
const HARDNESS = { stone: 1.5, cobblestone: 2, deepslate: 3, obsidian: 50, iron_ore: 3 }
const rock = (name, p) => ({ name, position: p, boundingBox: 'block', diggable: true, hardness: HARDNESS[name],
    material: 'mineable/pickaxe', canHarvest: () => false })

test('a bot is stranded only when no pickaxe is carried and none can be crafted', () => {
    assert.equal(pickaxeStranded(stuck([])), true)
    assert.equal(pickaxeStranded(stuck([['stick', 2]])), false)
    assert.equal(pickaxeStranded(stuck([['oak_planks', 1]])), false)
    assert.equal(pickaxeStranded(stuck([['wooden_pickaxe', 1]])), false)
    assert.equal(pickaxeStranded([stack(['oak_log', 3])]), false)
    assert.equal(pickaxeStranded([stack(['oak_log', 2])]), true)
    assert.equal(pickaxeStranded([]), true)
})

test('bare hands break stone and deepslate but never obsidian or ore', () => {
    for (const [name, expected] of [['stone', true], ['cobblestone', true], ['deepslate', true], ['obsidian', false], ['iron_ore', false]]) {
        assert.equal(handDiggable(rock(name, new Vec3(0, 0, 0))), expected, name)
    }
})

function tunnelBot(items) {
    const air = new Set(['(0, 64, 0)', '(0, 65, 0)'])
    const dug = []
    const bot = {
        health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
        inventory: { items: () => items },
        blockAt: p => air.has(p.toString()) || dug.some(d => d.equals(p))
            ? { name: 'air', position: p, boundingBox: 'empty' } : rock('stone', p),
        canDigBlock: () => true,
        async equip() { assert.fail('equipped a tool for stone without a pickaxe') },
        async unequip(slot) { bot.unequipped = slot },
        async dig(block) { dug.push(block.position) }
    }
    const c = { bot, running: true, memory: {}, log: { info() {}, warn() {} }, bestItem: () => null,
        async gotoWithTimeout(goal) { bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5) },
        async placeSurvivalBlock() {} }
    return { c, bot, dug }
}

test('a stranded bot carves a rising tunnel step by hand with an empty hand', async () => {
    const { c, bot, dug } = tunnelBot(stuck([]))
    await mineTunnel(c, 68)
    assert.equal(bot.entity.position.y, 68)
    assert.ok(dug.length >= 4)
    assert.equal(bot.unequipped, 'hand')
    const craftable = tunnelBot(stuck([['stick', 2]]))
    await assert.rejects(mineTunnel(craftable.c, 68), /mining requires a pickaxe/)
    assert.equal(craftable.dug.length, 0)
})

test('a stranded return carves the staircase by hand after the pickaxe-free walk fails', async () => {
    const warnings = []
    const { c, dug } = tunnelBot(stuck([]))
    Object.assign(c, { paused: false, home: { y: 69 }, log: { info() {}, warn: m => warnings.push(m) } })
    c.gotoWithTimeout = async goal => {
        if (goal.x === undefined) {
            throw new Error('No path to the goal!')
        }
        c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
    }
    await performProgression(c, 'return_surface', {}).catch(() => {})
    assert.ok(warnings.some(m => /carving the staircase by hand/.test(m)), warnings.join('\n'))
    assert.ok(dug.length >= 1)
})

test('the pickaxe guard and pathfinder exclusion lift only while stranded', () => {
    const items = stuck([])
    const movements = { bot: { registry: { blocksByName: new Proxy({}, { get: () => ({ id: 1 }) }) }, inventory: { items: () => items } },
        blocksCantBreak: new Set(), exclusionAreasBreak: [], exclusionAreasStep: [], fences: new Set() }
    SurvivalController.prototype.configureSafeMovements.call({}, movements)
    const exclusion = movements.exclusionAreasBreak.at(-1)
    assert.equal(exclusion(rock('stone', new Vec3(0, 0, 0))), 0)
    assert.equal(exclusion(rock('obsidian', new Vec3(0, 0, 0))), 100)
    items.push(stack(['stick', 2]))
    assert.equal(exclusion(rock('stone', new Vec3(0, 0, 0))), 100)
})
