'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')
const { nextAdvancement } = require('../src/advancement-plan')

const ironPickGoal = {
    hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
    cobblestone: 8, planks: 4, sticks: 2, ironIngots: 0, rawIron: 1
}

function smelter(raw = 11, coal = 5) {
    const inv = { raw_iron: raw, coal, iron_ingot: 0 }
    const furnaceState = { input: null, fuel: null, output: null }
    const furnace = {
        inputItem: () => furnaceState.input, fuelItem: () => furnaceState.fuel, outputItem: () => furnaceState.output,
        async putInput(type, meta, count) { inv.raw_iron -= count; furnaceState.input = { name: 'raw_iron', count } },
        async putFuel(type, meta, count) { inv.coal -= count; furnaceState.fuel = { name: 'coal', count } },
        async takeOutput() { inv.iron_ingot += furnaceState.output.count; furnaceState.output = null },
        async takeFuel() { inv.coal += furnaceState.fuel.count; furnaceState.fuel = null }
    }
    const furnaceBlock = { name: 'furnace', position: new Vec3(3, 64, 0) }
    const c = {
        memory: { pendingSmelt: true }, running: true, actionAbort: new AbortController(), log: { info() {}, warn() {} },
        bot: {
            game: { dimension: 'overworld' }, health: 20, entity: { position: new Vec3(0.5, 64, 0.5) },
            openFurnace: async () => furnace, closeWindow: async () => {}, blockAt: () => furnaceBlock
        },
        getFurnace: async () => furnaceBlock, reclaimed: 0,
        async reclaimStation() { c.reclaimed++ },
        bestItem: names => names.map(n => inv[n] > 0 ? { name: n, type: 1, count: inv[n] } : null).find(Boolean) || null,
        countItems: names => names.reduce((n, name) => n + (inv[name] || 0), 0),
        hasItem: name => inv[name] > 0, gotoWithTimeout: async () => {},
        hasAnyItem: names => names.some(name => inv[name] > 0)
    }
    c.bot.inventory = { items: () => Object.entries(inv).filter(([, n]) => n > 0).map(([name, count]) => ({ name, count, type: 1 })) }
    c.checkAction = SurvivalController.prototype.checkAction.bind(c)
    c.smeltIron = SurvivalController.prototype.smeltIron.bind(c)
    c.collectSmelt = SurvivalController.prototype.collectSmelt.bind(c)
    return { c, inv, furnaceState }
}

test('starting a smelt loads all raw iron with enough fuel, records a job and returns without waiting', async () => {
    const { c, inv, furnaceState } = smelter(11, 5)
    const started = Date.now()
    await SurvivalController.prototype.smeltIron.call(c)
    assert.ok(Date.now() - started < 1000)
    assert.equal(inv.raw_iron, 0)
    assert.equal(furnaceState.fuel.count, 2)
    assert.equal(c.memory.smeltJob.count, 11)
    assert.ok(c.memory.smeltJob.readyAt >= started + 110000)
    assert.equal(c.memory.pendingSmelt, false)
    assert.equal(c.reclaimed, 0)
})

test('the first pickaxe smelts only its missing ingots when more raw iron is available', async () => {
    const { c, inv, furnaceState } = smelter(11, 5)
    await SurvivalController.prototype.perform.call(c, 'smelt_iron', { ironIngots: 2, hasIronPickaxe: false })
    assert.equal(inv.raw_iron, 10)
    assert.equal(furnaceState.input.count, 1)
})

test('one spare plank can fuel the final ingot without a surface trip for charcoal', async () => {
    const { c, inv } = smelter(5, 0)
    inv.oak_planks = 1
    const state = { ...ironPickGoal, hasFurnace: true, ironIngots: 2, items: { oak_planks: 1 }, planks: 1 }
    assert.equal(nextAdvancement(state).action, 'smelt_iron')
    const furnace = await c.bot.openFurnace()
    let added = 0
    furnace.putFuel = async (type, meta, count) => { added = count }
    await SurvivalController.prototype.perform.call(c, 'smelt_iron', state)
    assert.equal(added, 1)
    assert.equal(inv.raw_iron, 4)
    assert.equal(nextAdvancement({ ...state, items: { crimson_planks: 1 } }).action, 'gather_wood')
})

test('collecting a finished job takes the ingots, clears the job and reclaims the furnace', async () => {
    const { c, inv, furnaceState } = smelter(11, 5)
    await SurvivalController.prototype.smeltIron.call(c)
    furnaceState.input = null
    furnaceState.output = { name: 'iron_ingot', count: 11 }
    c.memory.smeltJob.readyAt = Date.now() - 1
    await SurvivalController.prototype.smeltIron.call(c)
    assert.equal(inv.iron_ingot, 11)
    assert.equal(c.memory.smeltJob, null)
    assert.equal(c.reclaimed, 1)
})

test('the planner keeps mining while a job runs and collects once ready', () => {
    const state = {
        hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true,
        hasIronPickaxe: true, hasIronArmor: false, cobblestone: 20, planks: 8, logs: 2, sticks: 4, ironIngots: 0,
        rawIron: 0, hasSmeltingFuel: true, completedAdvancements: new Set(['minecraft:story/smelt_iron'])
    }
    assert.equal(nextAdvancement({ ...state, smeltRunning: true }).action, 'gather_iron')
    assert.equal(nextAdvancement({ ...state, smeltReady: true }).action, 'smelt_iron')
    assert.equal(nextAdvancement({ ...state, rawIron: 8 }).action, 'smelt_iron')
})

test('a fuel slot already holding planks does not stop the job from being recorded', async () => {
    const { c, inv, furnaceState } = smelter(30, 5)
    furnaceState.fuel = { name: 'oak_planks', count: 2 }
    await SurvivalController.prototype.smeltIron.call(c)
    assert.equal(inv.raw_iron, 0)
    assert.equal(c.memory.smeltJob.count, 30)
    assert.equal(furnaceState.fuel.name, 'oak_planks')
})

test('an existing coal stack in the fuel slot is topped up with coal', async () => {
    const { c, furnaceState } = smelter(30, 5)
    furnaceState.fuel = { name: 'coal', count: 1 }
    let added = 0
    const furnace = await c.bot.openFurnace()
    furnace.putFuel = async (type, meta, count) => { added = count; furnaceState.fuel.count += count }
    await SurvivalController.prototype.smeltIron.call(c)
    assert.equal(added, 3)
    assert.ok(c.memory.smeltJob)
})

test('reclaiming a placed furnace digs it directly instead of through collectTarget', async () => {
    let dug = false
    const station = { name: 'furnace', position: new Vec3(1, 64, 0) }
    const c = {
        memory: { ownedStations: new Set(['overworld:1,64,0']) },
        targetKey: block => `${block.position.x},${block.position.y},${block.position.z}`,
        collectTarget: async () => { throw new Error('unsafe block to mine: furnace') },
        gotoWithTimeout: async () => {}, visibleDrops: () => [],
        bot: {
            game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) }, entities: {},
            blockAt: () => station, dig: async () => { dug = true }, waitForTicks: async () => {}
        }
    }
    await SurvivalController.prototype.reclaimStation.call(c, station)
    assert.equal(dug, true)
    assert.equal(c.memory.ownedStations.size, 0)
})

test('a job whose fuel ran out is refuelled and rescheduled instead of revisited forever', async () => {
    const { c, inv, furnaceState } = smelter(0, 5)
    c.memory.smeltJob = { dimension: 'overworld', x: 3, y: 64, z: 0, count: 30, readyAt: Date.now() - 1 }
    furnaceState.input = { name: 'raw_iron', count: 22 }
    furnaceState.output = { name: 'iron_ingot', count: 8 }
    furnaceState.fuel = null
    await SurvivalController.prototype.smeltIron.call(c)
    assert.equal(inv.iron_ingot, 8)
    assert.equal(furnaceState.fuel.count, 3)
    assert.equal(c.memory.smeltJob.count, 22)
    assert.ok(c.memory.smeltJob.readyAt > Date.now() + 200000)
})

test('a fuel-starved job keeps its input and is marked for fuel after collecting partial output', async () => {
    const { c, inv, furnaceState } = smelter(0, 0)
    c.memory.smeltJob = { dimension: 'overworld', x: 3, y: 64, z: 0, count: 30, readyAt: Date.now() - 1 }
    furnaceState.input = { name: 'raw_iron', count: 22 }
    furnaceState.output = { name: 'iron_ingot', count: 8 }
    await SurvivalController.prototype.smeltIron.call(c)
    assert.equal(inv.iron_ingot, 8)
    assert.equal(furnaceState.input.count, 22)
    assert.equal(c.memory.smeltJob.count, 22)
    assert.equal(c.memory.smeltJob.needsFuel, true)
    inv.coal = 3
    await SurvivalController.prototype.smeltIron.call(c)
    assert.equal(furnaceState.fuel.count, 3)
    assert.equal(c.memory.smeltJob.needsFuel, false)
})

test('a fuel-starved job is refuelled with planks from carried logs instead of waiting for coal', async () => {
    const { c, inv, furnaceState } = smelter(0, 0)
    inv.oak_log = 25
    c.memory.smeltJob = { dimension: 'overworld', x: 3, y: 64, z: 0, count: 13, readyAt: Date.now() - 1, needsFuel: true }
    furnaceState.input = { name: 'raw_iron', count: 13 }
    const { smeltJobState } = require('../src/survival-bot')
    assert.equal(smeltJobState(c).smeltReady, true)
    c.ensurePlanks = async n => { inv.oak_log -= Math.ceil(n / 4); inv.oak_planks = (inv.oak_planks || 0) + 4 * Math.ceil(n / 4) }
    const furnace = await c.bot.openFurnace()
    let added = 0
    furnace.putFuel = async (type, meta, count) => { added = count; furnaceState.fuel = { name: 'oak_planks', count } }
    await SurvivalController.prototype.smeltIron.call(c)
    assert.equal(added, 9)
    assert.equal(c.memory.smeltJob.needsFuel, false)
    assert.equal(inv.oak_log, 22)
})

test('the first-iron goal gathers coal for a stalled job even if the furnace was left behind', () => {
    const stalled = { ...ironPickGoal, hasFurnace: false, smeltNeedsFuel: true, hasSmeltingFuel: false }
    assert.equal(nextAdvancement(stalled).action, 'gather_coal')
    assert.equal(nextAdvancement({ ...stalled, hasSmeltingFuel: true, smeltReady: true }).action, 'smelt_iron')
})

test('the first-iron goal leaves a running furnace to work even after gathering more raw iron', () => {
    assert.equal(nextAdvancement({ ...ironPickGoal, hasFurnace: true, smeltRunning: true }).action, 'gather_iron')
})

test('an unreachable smelt furnace is tunneled toward, then forgotten after twelve segments', async () => {
    const c = Object.create(SurvivalController.prototype)
    const job = { dimension: 'overworld', x: 172, y: 43, z: -176, count: 32 }
    let goal = 'none'
    Object.assign(c, {
        running: true, paused: false, actionAbort: new AbortController(), memory: { smeltJob: job }, log: { info() {}, warn() {} },
        bot: { health: 20, entity: { position: new Vec3(158.5, 64, -166.5) },
            pathfinder: { setGoal(g) { goal = g } }, async waitForTicks() {}, inventory: { items: () => [] } },
        bestItem: () => null,
        async gotoWithTimeout() { goal = 'stale'; throw new Error('No path to the goal!') }
    })
    // No pickaxe in the fixture: reaching mineTunnel shows the tunnel branch was taken.
    await assert.rejects(c.collectSmelt(job), /mining requires a pickaxe/)
    assert.equal(job.tunnels, 1)
    assert.equal(goal, null)
    job.tunnels = 12
    await assert.rejects(c.collectSmelt(job), /No path/)
    assert.equal(c.memory.smeltJob, null)
})

test('a smelt job is kept to 300 blocks and abandoned beyond', () => {
    const { SurvivalController } = require('../src/survival-bot')
    const c = Object.create(SurvivalController.prototype)
    c.bot = { game: { dimension: 'overworld' }, entity: { position: new Vec3(47.5, 8, -72.5) } }
    c.log = { warn() {} }
    c.hasAnyItem = () => false
    c.memory = { smeltJob: { dimension: 'overworld', x: 233, y: -54, z: -155, count: 3, readyAt: 0 } }
    const { smeltJobState } = require('../src/survival-bot')
    assert.equal(typeof smeltJobState, 'function')
    assert.equal(smeltJobState(c).smeltReady, true, 'a 3-iron job 212 blocks off is kept')
    assert.notEqual(c.memory.smeltJob, null)
    c.memory = { smeltJob: { dimension: 'overworld', x: 100, y: 8, z: -72, count: 10, readyAt: Date.now() + 60000 } }
    assert.deepEqual(smeltJobState(c), { smeltRunning: true, smeltReady: false }, 'an unfinished job 52 blocks off waits')
    c.memory.smeltJob.x = 300
    assert.equal(smeltJobState(c).smeltReady, true, 'an unfinished job near the abandonment radius is fetched')
    c.memory = { smeltJob: { dimension: 'overworld', x: 360, y: 8, z: -72, count: 32, readyAt: 0 } }
    assert.deepEqual(smeltJobState(c), { smeltRunning: false, smeltReady: false })
    assert.equal(c.memory.smeltJob, null)
})
