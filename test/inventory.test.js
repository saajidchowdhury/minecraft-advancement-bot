'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { discardableStack } = require('../src/inventory')

test('inventory cleanup keeps building reserves, ore, tools, food and rare items', () => {
    const valuable = [
        { name: 'diamond', count: 64 }, { name: 'iron_ingot', count: 64 },
        { name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 64 },
        { name: 'dirt', count: 64 }, { name: 'bread', count: 64 }, { name: 'diamond_pickaxe', count: 1 }
    ]
    assert.equal(discardableStack(valuable), null)
    const surplus = { name: 'cobblestone', count: 64 }
    assert.equal(discardableStack([...valuable, surplus]).name, 'cobblestone')
})
