'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Actions } = require('../src/decision-engine')
const { shouldRelocateAfterStationFailure } = require('../src/survival-bot')

test('repeated workstation placement failures trigger relocation every third failure', () => {
    const message = 'could not place crafting table; no clear supported space within five blocks'
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 2, message), false)
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 3, message), true)
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 4, message), false)
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 6, message), true)
})

test('ordinary crafting errors do not cause unrelated relocation', () => {
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 3, 'need more logs'), false)
    assert.equal(shouldRelocateAfterStationFailure(Actions.WOOD, 3, 'could not place crafting table'), false)
})
