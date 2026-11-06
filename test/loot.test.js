'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { findNearbyLoot, lootChest } = require('../src/loot')
const { chooseAction } = require('../src/decision-engine')

function site() {
    const chest = { name: 'chest', position: new Vec3(2, 40, 0) }
    const cart = { name: 'chest_minecart', position: new Vec3(3, 40, 0), uuid: 'cart-1', isValid: true }
    const contents = [{ name: 'diamond', type: 1, count: 2 }, { name: 'bread', type: 2, count: 3 }]
    const c = {
        memory: {}, checkAction() {}, canSee: () => true, log: { info() {} },
        observe: () => ({ health: 20, hostileDistance: Infinity }),
        findNearestBlock: (matches, radius, options) => matches(chest.name) && options.filter(chest) ? chest : null,
        bot: {
            game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 40, 0.5) },
            inventory: { emptySlotCount: () => 3 }, blockAt: () => chest, canSeeBlock: () => true,
            nearestEntity: matches => matches(cart) ? cart : null,
            async openContainer(target) {
                c.opened = target
                return {
                    containerItems: () => [...contents],
                    emptySlotCount: () => 1 + contents.length,
                    async withdraw(type, metadata, count) {
                        assert.deepEqual([type, metadata, count], [contents[0].type, null, contents[0].count])
                        contents.shift()
                    },
                    close() { c.closed = true }
                }
            }
        }
    }
    return { c, chest, cart, contents }
}

test('a seen chest is recorded before opening, then looted and skipped after it is emptied', async () => {
    const { c, chest, cart, contents } = site()
    const target = findNearbyLoot(c)
    assert.equal(target, chest)
    const record = c.memory.lootChests['overworld:chest:(2, 40, 0)']
    assert.deepEqual([record.x, record.y, record.z], [2, 40, 0])
    assert.equal(record.lootedAt, undefined)
    const state = { ...c.observe(), food: 20, lootTarget: target }
    assert.equal(chooseAction(state), 'loot_chest')
    assert.equal(chooseAction({ ...state, diamondInView: true }), 'mine_diamond')
    await lootChest(c, target)
    assert.equal(contents.length, 0)
    assert.ok(record.lootedAt >= record.foundAt)
    assert.equal(record.exhausted, true)
    assert.equal(c.closed, true)
    assert.equal(findNearbyLoot(c), cart)
})

test('a chest minecart is looted while the bot-owned chest is skipped', async () => {
    const { c, chest, cart } = site()
    c.memory.base = { dimension: 'overworld', chest: chest.position }
    assert.equal(findNearbyLoot(c), cart)
    await lootChest(c, cart)
    assert.equal(c.opened, cart)
    cart.position = new Vec3(1, 40, 1)
    assert.equal(findNearbyLoot(c), null)
    const record = c.memory.lootChests['overworld:chest_minecart:cart-1']
    assert.deepEqual([record.x, record.y, record.z], [1, 40, 1])
    assert.ok(record.lootedAt)
})
