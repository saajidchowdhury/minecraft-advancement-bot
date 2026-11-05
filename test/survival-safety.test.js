'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')
const { Actions } = require('../src/decision-engine')

function shelterWorld() {
    const blocks = new Map()
    const c = {
        running: true, paused: false, sheltered: false, actionAbort: new AbortController(),
        log: { info() {}, warn() {} }, countItems: () => 64, findNearestBlock: () => null,
        bot: {
            health: 20, entity: { position: new Vec3(0.5, 64, 0.5) },
            blockAt(p) {
                const name = blocks.get(p.toString()) || (p.y < 64 ? 'stone' : 'air')
                return { name, position: p, boundingBox: name === 'air' ? 'empty' : 'block',
                    shapes: name === 'air' ? [] : [[0, 0, 0, 1, 1, 1]] }
            }
        },
        async placeSurvivalBlock(p) { blocks.set(p.toString(), 'cobblestone') },
        blocks
    }
    c.isEmptyPlacementBlock = SurvivalController.prototype.isEmptyPlacementBlock.bind(c)
    c.checkAction = SurvivalController.prototype.checkAction.bind(c)
    c.hasEnclosedShelter = SurvivalController.prototype.hasEnclosedShelter.bind(c)
    return c
}

test('critical-health events interrupt mining but do not cancel an active escape', () => {
    let cancellations = 0
    const bot = new EventEmitter()
    bot.health = 4
    const c = { bot, busy: true, activeAction: Actions.ESCAPE, lastAction: Actions.ESCAPE,
        cancelCurrentTask() { cancellations++ } }
    SurvivalController.prototype.bindEvents.call(c)
    bot.emit('health')
    assert.equal(cancellations, 0)
    c.activeAction = Actions.IRON
    bot.emit('health')
    assert.equal(cancellations, 1)
})

test('a failed wall placement cannot produce a complete shelter', async () => {
    const c = shelterWorld()
    const place = c.placeSurvivalBlock
    c.placeSurvivalBlock = async p => {
        if (p.equals(new Vec3(1, 65, 0))) {
            throw new Error('simulated placement failure')
        }
        await place(p)
    }
    await assert.rejects(SurvivalController.prototype.makeNightSafe.call(c), /incomplete|enclosure/)
    assert.equal(c.sheltered, false)
})

test('a cancelled shelter stops placing blocks and cannot announce completion', async () => {
    const c = shelterWorld()
    let placements = 0
    c.placeSurvivalBlock = async () => {
        placements++
        if (placements === 3) {
            c.actionAbort.abort()
        }
    }
    await assert.rejects(SurvivalController.prototype.makeNightSafe.call(c), /cancelled/)
    assert.equal(placements, 3)
    assert.equal(c.sheltered, false)
})

test('completed shelter geometry can be checked again after a wall is destroyed', async () => {
    const c = shelterWorld()
    await SurvivalController.prototype.makeNightSafe.call(c)
    assert.equal(c.sheltered, true)
    assert.equal(c.hasEnclosedShelter(c.shelterCenter), true)
    c.blocks.set(new Vec3(1, 65, 0).toString(), 'air')
    assert.equal(c.hasEnclosedShelter(c.shelterCenter), false)
})

test('cancellation during equipping prevents the subsequent placement packet', async () => {
    const c = shelterWorld()
    let placed = false
    c.bestItem = () => ({ name: 'cobblestone' })
    c.bot.equip = async () => { c.actionAbort.abort() }
    c.bot.placeBlock = async () => { placed = true }
    await assert.rejects(SurvivalController.prototype.placeSurvivalBlock.call(c, new Vec3(1, 64, 0)), /cancelled/)
    assert.equal(placed, false)
})

test('a repeated death during the same recovery preserves the first drop age and attempt count', () => {
    const bot = new EventEmitter()
    bot.health = 20
    bot.game = { dimension: 'overworld' }
    bot.entity = { position: new Vec3(-54, 74, 32) }
    const diedAt = Date.now() - 60000
    const c = { bot, memory: { lastDeath: { x: -52, y: 75, z: 32, dimension: 'overworld', diedAt, attempts: 2 } },
        log: { warn() {} }, cancelCurrentTask() {} }
    SurvivalController.prototype.bindEvents.call(c)
    bot.emit('death')
    assert.equal(c.memory.lastDeath.diedAt, diedAt)
    assert.equal(c.memory.lastDeath.attempts, 2)
    assert.equal(c.memory.lastDeath.x, -54)
    bot.game.dimension = 'the_nether'
    bot.emit('death')
    assert.equal(c.memory.lastDeath.attempts, 0)
    assert.equal(c.memory.lastDeath.dimension, 'the_nether')
})
