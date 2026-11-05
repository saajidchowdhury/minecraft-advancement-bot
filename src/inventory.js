'use strict'

// Item counts kept when freeing slots; rubble beyond these is surplus.
const RESERVES = Object.freeze({
    cobblestone: 64, cobbled_deepslate: 64, dirt: 16, granite: 0,
    diorite: 0, andesite: 0, tuff: 0, gravel: 32, netherrack: 64
})

function discardableStacks(items) {
    const counts = {}
    for (const item of items) {
        counts[item.name] = (counts[item.name] || 0) + item.count
    }
    const surplus = []
    for (const item of [...items].sort((a, b) => b.count - a.count)) {
        if (Object.hasOwn(RESERVES, item.name) && counts[item.name] - item.count >= RESERVES[item.name]) {
            counts[item.name] -= item.count
            surplus.push(item)
        }
    }
    return surplus
}

function discardableStack(items) {
    return discardableStacks(items)[0] || null
}

module.exports = { discardableStack, discardableStacks }
