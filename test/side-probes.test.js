'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const mcData = require('minecraft-data')('26.1')
const { probeTunnelSides, mineTunnel } = require('../src/progression-skills')

function miningWorld(overrides = new Map()) {
    const air = new Set()
    const dug = []
    const controls = {}
    let heading = new Vec3(0, 0, 0)
    const bot = {
        health: 20,
        entity: { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62 },
        blockAt(p) {
            const name = overrides.get(p.toString()) || (air.has(p.toString()) ? 'air' : 'stone')
            return { name, position: p, boundingBox: name === 'air' ? 'empty' : 'block', diggable: true, canHarvest: () => true }
        },
        canDigBlock: block => bot.entity.position.offset(0, 1.65, 0).distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 5.1,
        canSeeBlock: () => true, equip: async () => {},
        async lookAt(target) {
            const delta = target.minus(bot.entity.position)
            heading = new Vec3(delta.x, 0, delta.z).normalize()
        },
        setControlState(key, value) { controls[key] = value },
        async waitForTicks() {
            if (controls.forward && controls.sneak) {
                bot.entity.position.add(heading.scaled(0.06))
            }
        },
        async dig(block, force, face) {
            if (face) {
                const target = block.position.offset(0.5, 0.5, 0.5).plus(face.scaled(0.5))
                assert.ok(bot.entity.position.offset(0, 1.62, 0).distanceTo(target) <= 4.5)
            }
            dug.push(block.position)
            air.add(block.position.toString())
        }
    }
    return {
        bot, dug, memory: {}, running: true, paused: false, actionAbort: new AbortController(), probeSpacing: 8,
        bestItem: () => ({ name: 'iron_pickaxe' }), log: { info() {} },
        async gotoWithTimeout(goal) {
            bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        }
    }
}

test('probes reach five blocks on both sides while staying in the tunnel cell', async () => {
    const c = miningWorld()
    const anchor = c.bot.entity.position.clone()
    const result = await probeTunnelSides(c, 0)
    assert.equal(result.dug, 10)
    assert.equal(result.foundOre, false)
    assert.deepEqual(c.bot.entity.position.floored(), anchor.floored())
    assert.equal(c.dug.every(p => p.x === 0 && p.y === 65 && Math.abs(p.z) <= 5), true)
    assert.equal(c.dug.some(p => p.z === -5), true)
    assert.equal(c.dug.some(p => p.z === 5), true)
})

test('a liquid or falling-block neighbor stops that probe before opening the hazard', async () => {
    for (const hazard of ['lava', 'water', 'gravel', 'sand']) {
        const c = miningWorld(new Map([[new Vec3(0, 65, 3).toString(), hazard]]))
        await probeTunnelSides(c, 0)
        assert.equal(c.dug.some(p => p.z >= 2), false)
        assert.equal(c.dug.filter(p => p.z < 0).length, 5)
    }
})

test('exposed ore is left for the harvesting skill and stops further probing on that side', async () => {
    const c = miningWorld(new Map([[new Vec3(0, 65, 3).toString(), 'iron_ore']]))
    const result = await probeTunnelSides(c, 0)
    assert.equal(result.foundOre, true)
    assert.equal(c.dug.some(p => p.z >= 3), false)
})

test('two four-block tunnel actions trigger one pair of probes at spacing eight', async () => {
    const c = miningWorld()
    await mineTunnel(c, 64)
    assert.equal(c.memory.probeMinedBlocks || 0, 0)
    await mineTunnel(c, 64)
    assert.equal(c.memory.probeMinedBlocks, 10)
    assert.equal(c.memory.probeSteps, 0)
    assert.equal(c.bot.entity.position.x, 8.5)
})

test('a mixed tunnel uses the stone shovel on dirt and grass blocks and the pick on stone', async () => {
    const c = miningWorld(new Map([['(1, 65, 0)', 'dirt'], ['(1, 64, 0)', 'grass_block']]))
    const tools = ['stone_shovel', 'iron_pickaxe'].map(name => mcData.itemsByName[name])
    c.bestItem = names => names.map(name => tools.find(item => item.name === name)).find(Boolean)
    const blockAt = c.bot.blockAt
    c.bot.blockAt = p => {
        const block = blockAt(p)
        block.material = mcData.blocksByName[block.name].material
        return block
    }
    c.bot.equip = async item => { c.bot.heldItem = item }
    const digs = []
    const dig = c.bot.dig
    c.bot.dig = async block => {
        digs.push([block.name, c.bot.heldItem.name])
        await dig(block)
    }
    await mineTunnel(c, 64)
    assert.deepEqual(digs.slice(0, 3), [['dirt', 'stone_shovel'], ['grass_block', 'stone_shovel'], ['stone', 'iron_pickaxe']])
})

test('pausing during a probe prevents subsequent digs', async () => {
    const c = miningWorld()
    const dig = c.bot.dig
    c.bot.dig = async block => {
        await dig(block)
        c.actionAbort.abort()
    }
    await assert.rejects(probeTunnelSides(c, 0), /cancelled/)
    assert.equal(c.dug.length, 1)
})
