'use strict'

const RESERVES = Object.freeze({
    cobblestone: 128, cobbled_deepslate: 64, dirt: 64, granite: 32,
    diorite: 32, andesite: 32, tuff: 32, gravel: 32, netherrack: 64
})

function discardableStack(items) {
    const counts = {}
    for (const item of items) {
        counts[item.name] = (counts[item.name] || 0) + item.count
    }
    return items.filter(item => Object.hasOwn(RESERVES, item.name) &&
        counts[item.name] - item.count >= RESERVES[item.name])
        .reduce((best, item) => !best || item.count > best.count ? item : best, null)
}

module.exports = { discardableStack }
