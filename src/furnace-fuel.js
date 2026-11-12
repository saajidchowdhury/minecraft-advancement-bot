'use strict'

const BURN_TICKS = { coal: 1600, charcoal: 1600, coal_block: 16000, blaze_rod: 2400, lava_bucket: 20000, stick: 100 }
const isFuelPlank = name => name.endsWith('_planks') && !/^(crimson|warped)_/.test(name)
const isCharcoalLog = name => /_(log|wood)$/.test(name)

function furnaceFuelTicks(furnace) {
    const burning = furnace.totalFuel ? Math.round((furnace.fuel || 0) * furnace.totalFuel) : 0
    const slot = furnace.fuelItem()
    return burning + (slot ? slot.count * (BURN_TICKS[slot.name] ?? (slot.name.endsWith('_slab') ? 150 : 300)) : 0)
}

function plankFuelPlan(items, needed) {
    const types = new Map()
    for (const { name, count } of items) {
        if (!isFuelPlank(name) && !isCharcoalLog(name)) {
            continue
        }
        const planks = name.replace(/^stripped_/, '').replace(/_(log|wood)$/, '_planks')
        const stack = types.get(planks) ?? { planks: 0, logs: 0 }
        stack[isFuelPlank(name) ? 'planks' : 'logs'] += count
        types.set(planks, stack)
    }
    let best = null
    for (const [name, { planks, logs }] of types) {
        const count = Math.min(needed, planks + 4 * logs)
        const craftCount = Math.max(0, count - planks)
        if (!best || count > best.count || (count === best.count && craftCount < best.craftCount)) {
            best = { name, count, craftCount }
        }
    }
    return best
}

async function preparePlankFuel(c, block, furnace, plan) {
    if (!plan?.craftCount) {
        return furnace
    }
    await c.bot.closeWindow(furnace)
    await c.craftItem(plan.name, plan.craftCount, false)
    c.checkAction()
    return c.bot.openFurnace(block)
}

module.exports = { isFuelPlank, isCharcoalLog, furnaceFuelTicks, plankFuelPlan, preparePlankFuel }
