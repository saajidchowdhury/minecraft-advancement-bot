'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { AdvancementTracker } = require('../src/advancement-tracker')

function packet(requirements, progress, reset = false, id = 'minecraft:story/test') {
    return {
        reset,
        advancementMapping: [{ key: id, value: { requirements } }],
        progressMapping: [{ key: id, value: Object.entries(progress).map(([criterionIdentifier, done]) =>
            ({ criterionIdentifier, criterionProgress: done ? [0, 1] : undefined })) }]
    }
}

test('actual server requirements are AND-of-OR groups, not any criterion', () => {
    const earned = []
    const tracker = new AdvancementTracker(id => earned.push(id))
    tracker.update(packet([['a', 'b'], ['c']], { b: true }))
    assert.deepEqual(earned, [])
    tracker.update(packet([['a', 'b'], ['c']], { c: true }))
    assert.deepEqual(earned, ['minecraft:story/test'])
    tracker.update(packet([['a', 'b'], ['c']], { c: true }))
    assert.equal(earned.length, 1)
})

test('reset replaces completion from the previous server connection', () => {
    const tracker = new AdvancementTracker()
    tracker.update(packet([['a']], { a: true }))
    tracker.update({ reset: true, advancementMapping: [], progressMapping: [] })
    assert.equal(tracker.completed.size, 0)
})

test('definitions and criteria may arrive separately, and revocation removes completion', () => {
    const tracker = new AdvancementTracker()
    tracker.update({ progressMapping: [{ key: 'id', value: [{ criterionIdentifier: 'a', criterionProgress: [0, 0] }] }] })
    tracker.update({ advancementMapping: [{ key: 'id', value: { requirements: [['a']] } }] })
    assert.equal(tracker.completed.has('id'), true)
    tracker.update({ progressMapping: [{ key: 'id', value: [{ criterionIdentifier: 'a' }] }] })
    assert.equal(tracker.completed.has('id'), false)
})

test('recipes do not appear in advancement announcements or summaries', () => {
    const earned = []
    const tracker = new AdvancementTracker(id => earned.push(id))
    tracker.update(packet([['a']], { a: true }, true, 'minecraft:recipes/tools/test'))
    assert.deepEqual(earned, [])
    assert.deepEqual(tracker.summary(), [])
})

test('empty requirements and removed definitions never create phantom completions', () => {
    const tracker = new AdvancementTracker()
    tracker.update(packet([], { a: true }))
    assert.equal(tracker.completed.size, 0)
    tracker.update(packet([['a']], { a: true }))
    tracker.update({ identifiers: ['minecraft:story/test'] })
    assert.equal(tracker.completed.size, 0)
})
