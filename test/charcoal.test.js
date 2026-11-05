'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { performProgression } = require('../src/progression-skills')

test('charcoal accepts two different single-plank fuel stacks', async () => {
    const items = [{ name: 'oak_planks', count: 1, type: 1 },
        { name: 'birch_planks', count: 1, type: 2 }, { name: 'birch_log', count: 1, type: 3 }]
    const inventorySnapshot = items.map(item => ({ ...item }))
    const fuel = []
    let input = null
    let reclaimed = false
    const furnace = {
        items: () => items.filter(item => item.count > 0),
        outputItem: () => fuel.length === 2 ? { name: 'charcoal', count: 1 } : null,
        inputItem: () => input,
        fuelItem: () => null,
        async putInput(type) { input = items.find(item => item.type === type) },
        async putFuel(type, metadata, count) {
            const stack = items.find(item => item.type === type && item.count >= count)
            if (!stack) {
                throw new Error('fuel absent from the open furnace inventory')
            }
            fuel.push(type)
            stack.count -= count
        },
        takeInput: async () => {},
        takeOutput: async () => {}
    }
    const controller = {
        running: true, paused: false, actionAbort: new AbortController(), memory: {},
        ensurePlanks: async () => {}, getFurnace: async () => ({}),
        reclaimStation: async () => { reclaimed = true },
        bot: { health: 20, inventory: { items: () => inventorySnapshot },
            openFurnace: async () => furnace, closeWindow: async () => {} }
    }
    await performProgression(controller, 'smelt_charcoal', {})
    assert.deepEqual(fuel, [1, 2])
    assert.equal(reclaimed, true)
})
