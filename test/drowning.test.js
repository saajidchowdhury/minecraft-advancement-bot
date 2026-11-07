'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')
const { chooseAction } = require('../src/decision-engine')

test('authoritative low air overrides work even when the head block is not named water', () => {
    assert.equal(chooseAction({ health: 14, food: 20, oxygen: 0, headInWater: false, hostileDistance: Infinity }), 'surface_for_air')
})

test('the breath event interrupts crafting before damage and does not interrupt the rescue', () => {
    const bot = new EventEmitter()
    Object.assign(bot, { health: 20, oxygenLevel: 12 })
    let cancelled = 0
    const c = { bot, running: true, busy: true, activeAction: 'craft_progression', actionAbort: new AbortController(),
        cancelCurrentTask() { cancelled++ } }
    SurvivalController.prototype.bindEvents.call(c)
    bot.emit('breath')
    assert.equal(cancelled, 1)
    c.activeAction = 'surface_for_air'
    bot.emit('breath')
    assert.equal(cancelled, 1)
})

test('direct surfacing swims around an overhang without allowing pathfinding to cancel jump', async () => {
    const c = Object.create(SurvivalController.prototype)
    c.running = true
    c.paused = false
    c.actionAbort = new AbortController()
    c.log = { warn() {} }
    const controls = {}
    let ticks = 0
    c.bot = {
        health: 20, oxygenLevel: 5,
        entity: { position: new Vec3(0.5, 50, 0.5), eyeHeight: 1.62 },
        pathfinder: { setGoal: goal => assert.equal(goal, null) },
        clearControlStates: () => { for (const k of Object.keys(controls)) { controls[k] = false } },
        setControlState: (k, v) => { controls[k] = v },
        blockAt(p) {
            const wall = Math.abs(p.x) > 4 || Math.abs(p.z) > 4 || p.y < 50 || (p.x === 0 && p.z === 0 && p.y === 53)
            return { name: wall ? 'stone' : p.y >= 54 ? 'air' : 'water', boundingBox: wall ? 'block' : 'empty' }
        },
        async lookAt(p) { c.direction = p.minus(c.bot.entity.position); c.direction.y = 0; c.direction = c.direction.normalize() },
        async waitForTicks() {
            ticks++
            assert.equal(controls.jump, true)
            const p = c.bot.entity.position
            if (controls.forward) { p.add(c.direction.scaled(0.2)) }
            if (c.bot.blockAt(p.offset(0, 1.9, 0).floored()).boundingBox !== 'block') { p.y += 0.2 }
            if (c.bot.blockAt(p.offset(0, 1.62, 0).floored()).name === 'air') { c.bot.oxygenLevel = 20 }
        }
    }
    c.gotoWithTimeout = async () => assert.fail('pathfinder must not own emergency swim controls')
    await c.surfaceForAir()
    assert.equal(c.bot.oxygenLevel, 20)
    assert.ok(ticks < 100)
    assert.equal(controls.jump, false)
    assert.equal(controls.forward, false)
})

test('workstation reclamation does not dive after an item over water', async () => {
    const station = { name: 'furnace', position: new Vec3(1, 64, 0) }
    const drop = { position: new Vec3(1.5, 62, 1.5) }
    let dived = false
    const c = {
        memory: { ownedStations: new Set(['overworld:1,64,0']) }, log: { info() {} },
        targetKey: b => `${b.position.x},${b.position.y},${b.position.z}`,
        visibleDrops: () => [drop],
        gotoWithTimeout: async () => { dived = true },
        bot: { game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
            blockAt: p => p.equals(station.position) ? station : { name: 'water', boundingBox: 'empty' },
            dig: async () => {}, waitForTicks: async () => {} }
    }
    await SurvivalController.prototype.reclaimStation.call(c, station)
    assert.equal(c.memory.ownedStations.size, 0)
    assert.equal(dived, false)
})

test('workstation reclamation leaves the block supporting the bot intact', async () => {
    const station = { name: 'crafting_table', position: new Vec3(1, 64, 0) }
    let dug = false
    const c = { memory: { ownedStations: new Set(['overworld:1,64,0']) }, log: { info() {} },
        targetKey: b => `${b.position.x},${b.position.y},${b.position.z}`, visibleDrops: () => [],
        bot: { game: { dimension: 'overworld' }, entity: { position: new Vec3(1.5, 65, 0.5) },
            blockAt: () => station, dig: async () => { dug = true }, waitForTicks: async () => {} } }
    await SurvivalController.prototype.reclaimStation.call(c, station)
    assert.equal(dug, false)
})

test('cancellation while equipping prevents a subsequent station dig', async () => {
    const station = { name: 'furnace', position: new Vec3(1, 64, 0) }
    const c = { actionAbort: new AbortController(), memory: { ownedStations: new Set(['overworld:1,64,0']) },
        targetKey: b => `${b.position.x},${b.position.y},${b.position.z}`,
        bot: { game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
            blockAt: () => station, tool: { equipForBlock: async () => c.actionAbort.abort() },
            dig: async () => assert.fail('dug after the rescue interrupt') } }
    await assert.rejects(SurvivalController.prototype.reclaimStation.call(c, station), /cancelled/)
})
