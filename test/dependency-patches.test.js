'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('Mineflayer crafting synchronization fixes are installed', () => {
    const project = path.resolve(__dirname, '..')
    const inventory = fs.readFileSync(path.join(project, 'node_modules/mineflayer/lib/plugins/inventory.js'), 'utf8')
    const craft = fs.readFileSync(path.join(project, 'node_modules/mineflayer/lib/plugins/craft.js'), 'utf8')
    assert.match(inventory, /function takeCraftingIngredients/)
    assert.match(craft, /async function settleInventoryGrid/)
})
