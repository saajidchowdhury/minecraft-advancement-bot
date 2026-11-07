'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { dryMovements } = require('./cave-exploration')
const { canSeeBlock } = require('./vision')

function chestRecord(c, target) {
    const dimension = c.bot.game.dimension
    const position = target.position.floored()
    const key = `${dimension}:${target.name}:${target.uuid || position}`
    c.memory.lootChests ??= {}
    const record = c.memory.lootChests[key] ??= { dimension, kind: target.name, foundAt: Date.now() }
    Object.assign(record, { x: position.x, y: position.y, z: position.z })
    return record
}

function findNearbyLoot(c) {
    const bot = c.bot
    const base = c.memory.base
    const available = target => {
        if (target.name === 'chest' && base?.dimension === bot.game.dimension &&
            target.position.distanceTo(new Vec3(base.chest.x, base.chest.y, base.chest.z)) <= 1) {
            return false
        }
        const record = chestRecord(c, target)
        return !record.exhausted && !(record.retryAfter > Date.now())
    }
    const chest = c.findNearestBlock(name => name === 'chest', 12, { filter: available })
    const cart = bot.nearestEntity(entity => entity.name === 'chest_minecart' && entity.isValid &&
        entity.position.distanceTo(bot.entity.position) <= 12 && c.canSee(entity) && available(entity))
    if (!chest || !cart) {
        return chest || cart
    }
    const here = bot.entity.position
    return here.distanceTo(chest.position) <= here.distanceTo(cart.position) ? chest : cart
}

async function lootChest(c, target) {
    const bot = c.bot
    const signal = c.actionAbort?.signal
    const record = chestRecord(c, target)
    const cart = target.name === 'chest_minecart'
    const p = target.position.floored()
    const inReach = () => bot.entity.position.distanceTo(cart ? target.position : p.offset(0.5, 0.5, 0.5)) <= 4 &&
        (cart ? target.isValid && c.canSee(target) : bot.blockAt(p)?.name === 'chest' && canSeeBlock(bot, bot.blockAt(p)))
    let window
    record.retryAfter = Date.now() + 120000
    try {
        c.checkAction(signal)
        if (!inReach()) {
            bot.pathfinder.setMovements(dryMovements(bot))
            try {
                const goal = cart ? new goals.GoalNear(p.x, p.y, p.z, 2) : new goals.GoalLookAtBlock(p, bot.world)
                await c.gotoWithTimeout(goal, 10000, 'chest approach')
            } finally {
                bot.pathfinder.setGoal(null)
                bot.pathfinder.setMovements(c.movements)
            }
        }
        c.checkAction(signal)
        const state = c.observe()
        if (!inReach() || state.hostileDistance <= 12 || state.health < 16 || bot.inventory.emptySlotCount() <= 1) {
            return
        }
        window = await bot.openContainer(cart ? target : bot.blockAt(p))
        const items = window.containerItems()
        for (const item of items) {
            c.checkAction(signal)
            if (window.emptySlotCount() <= 1) {
                break
            }
            await window.withdraw(item.type, item.metadata ?? null, item.count, item.nbt)
            record.lootedAt = Date.now()
            c.log.info(`Looted ${item.count} ${item.name} from ${target.name} at ${p}.`)
        }
        record.exhausted = window.containerItems().length === 0
    } finally {
        window?.close()
    }
}

module.exports = { findNearbyLoot, lootChest }
