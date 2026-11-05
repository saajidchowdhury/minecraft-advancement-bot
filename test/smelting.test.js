'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')
const { nextAdvancement } = require('../src/advancement-plan')

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
            game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
            openFurnace: async () => furnace, closeWindow: async () => {}, blockAt: () => furnaceBlock
        },
        getFurnace: async () => furnaceBlock, reclaimed: 0,
        async reclaimStation() { c.reclaimed++ },
        bestItem: names => names.map(n => inv[n] > 0 ? { name: n, type: 1, count: inv[n] } : null).find(Boolean) || null,
        countItems: names => names.reduce((n, name) => n + (inv[name] || 0), 0),
        hasItem: name => inv[name] > 0, gotoWithTimeout: async () => {}
    }
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
