'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Actions } = require('../src/decision-engine')
const { actionMadeProgress } = require('../src/survival-bot')

test('wood gathering cannot report success after standing still and collecting nothing', () => {
    const inventory = { logs: 0, planks: 0 }
    assert.equal(actionMadeProgress(Actions.WOOD, inventory, inventory, false), false)
})

test('wood gathering accepts either collected wood or real scouting movement', () => {
    const before = { logs: 0, planks: 0 }
    assert.equal(actionMadeProgress(Actions.WOOD, before, { logs: 1, planks: 0 }, false), true)
    assert.equal(actionMadeProgress(Actions.WOOD, before, before, true), true)
})

test('discovering diamond ore lets a mining action yield without triggering failure recovery', () => {
    const before = { rawIron: 0, diamondInView: false }
    assert.equal(actionMadeProgress(Actions.IRON, before, { ...before, diamondInView: true }, false), true)
})
