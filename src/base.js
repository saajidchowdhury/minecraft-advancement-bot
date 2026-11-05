'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')

// A base is one chest near the shaft entrance (F033). Mobs cannot take items from chests,
// so surplus kept there survives deaths; after a death the bot restocks instead of
// rebuilding from wood (G013).
const TIERS = ['wooden', 'golden', 'stone', 'iron', 'diamond', 'netherite']
const tier = name => TIERS.indexOf(name.split('_')[0])
const ARMOR = ['helmet', 'chestplate', 'leggings', 'boots']
// Carry limits: surplus beyond these is stored, and restocking refills up to the same
// levels, so a restock never triggers a deposit (no chest ping-pong).
const CARRY = {
    diamond: 8, iron_ingot: 16, raw_iron: 16, redstone: 8, coal: 16, charcoal: 16, torch: 32,
    gold_ingot: 0, raw_gold: 0, lapis_lazuli: 0, emerald: 0, raw_copper: 0, copper_ingot: 0,
    string: 0, bone: 0, gunpowder: 0, ender_pearl: 0, slime_ball: 0, spider_eye: 0, feather: 0,
    leather: 0, arrow: 0, crafting_table: 1, furnace: 1
}
const RESTOCK = { diamond: 8, iron_ingot: 16, raw_iron: 16, coal: 16, torch: 32, crafting_table: 1, furnace: 1, bucket: 1, obsidian: 64, flint_and_steel: 1 }
const FOODS = ['cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'cooked_rabbit', 'bread', 'baked_potato', 'golden_carrot', 'apple', 'carrot']

function totals(items) {
    const counts = {}
    for (const item of items) {
        counts[item.name] = (counts[item.name] || 0) + item.count
    }
    return counts
}

function groupLimit(counts, plan, match, limit) {
    let kept = 0
    for (const [name, count] of Object.entries(counts).filter(([name]) => match(name)).sort((a, b) => b[1] - a[1])) {
        const keep = Math.min(count, Math.max(0, limit - kept))
        kept += keep
        if (count > keep) {
            plan.push({ name, count: count - keep })
        }
    }
}

// Items to store: duplicate tools, armor no better than what is worn, and surplus materials.
function depositPlan(items, worn = {}) {
    const counts = totals(items)
    const plan = []
    for (const kind of ['pickaxe', 'sword', 'axe', 'shovel', 'hoe']) {
        const owned = Object.keys(counts).filter(name => name.endsWith(`_${kind}`) && tier(name) >= 0).sort((a, b) => tier(b) - tier(a))
        for (const name of owned) {
            const keep = (name === owned[0] ? 1 : 0) + (kind === 'pickaxe' && name === 'stone_pickaxe' ? 1 : 0)
            if (counts[name] > keep) {
                plan.push({ name, count: counts[name] - keep })
            }
        }
    }
    for (const piece of ARMOR) {
        const wornTier = worn[piece] ? tier(worn[piece]) : -1
        for (const name of Object.keys(counts).filter(name => name.endsWith(`_${piece}`) && tier(name) >= 0 && tier(name) <= wornTier)) {
            plan.push({ name, count: counts[name] })
        }
    }
    for (const [name, limit] of Object.entries(CARRY)) {
        if (counts[name] > limit) {
            plan.push({ name, count: counts[name] - limit })
        }
    }
    groupLimit(counts, plan, name => name.endsWith('_log'), 16)
    groupLimit(counts, plan, name => name.endsWith('_planks'), 16)
    groupLimit(counts, plan, name => FOODS.includes(name), 16)
    groupLimit(counts, plan, name => name.endsWith('_bed'), 1)
    return plan
}

// Items to take from the stored contents ({name: count}) to re-arm and refill carry levels.
function restockPlan(stored, items, worn = {}) {
    const counts = totals(items)
    const plan = []
    const take = (name, count) => {
        const n = Math.min(count, stored[name] || 0)
        if (n > 0) {
            plan.push({ name, count: n })
        }
    }
    const best = kind => Object.keys(stored).filter(name => name.endsWith(`_${kind}`) && stored[name] > 0 && tier(name) >= 0)
        .sort((a, b) => tier(b) - tier(a))[0]
    for (const kind of ['pickaxe', 'sword']) {
        const carried = Math.max(-1, ...Object.keys(counts).filter(name => name.endsWith(`_${kind}`)).map(tier))
        const stash = best(kind)
        if (stash && tier(stash) > carried) {
            take(stash, 1)
        }
    }
    if (!counts.stone_pickaxe) {
        take('stone_pickaxe', 1)
    }
    for (const piece of ARMOR) {
        const stash = best(piece)
        if (stash && tier(stash) > (worn[piece] ? tier(worn[piece]) : -1) && !counts[stash]) {
            take(stash, 1)
        }
    }
    if (!counts.shield && !worn.offhand) {
        take('shield', 1)
    }
    for (const [name, limit] of Object.entries(RESTOCK)) {
        take(name, limit - (counts[name] || 0))
    }
    const room = (match, limit) => Math.max(0, limit - Object.entries(counts).filter(([name]) => match(name)).reduce((n, [, c]) => n + c, 0))
    for (const [match, limit] of [[name => name.endsWith('_log'), 16], [name => name.endsWith('_planks'), 16], [name => FOODS.includes(name), 16]]) {
        let left = room(match, limit)
        for (const name of Object.keys(stored).filter(match)) {
            const n = Math.min(left, stored[name])
            if (n > 0) {
                plan.push({ name, count: n })
                left -= n
            }
        }
    }
    return plan
}

const GEAR = /_(pickaxe|sword|helmet|chestplate|leggings|boots)$|^shield$/

function wornNames(bot) {
    const slots = bot.inventory.slots
    return { helmet: slots[5]?.name, chestplate: slots[6]?.name, leggings: slots[7]?.name, boots: slots[8]?.name, offhand: slots[45]?.name }
}

function baseState(c, state) {
    const bot = c.bot
    const base = c.memory.base
    const here = bot.entity.position
    const items = bot.inventory.items()
    const worn = wornNames(bot)
    const calm = !state.isNight && state.hostileDistance > 12 && !state.underground
    if (!base || base.dimension !== bot.game.dimension) {
        const anchor = c.memory.shaft?.dimension === bot.game.dimension ? c.memory.shaft.cells[0] : c.home
        state.baseEstablish = Boolean(calm && bot.game.dimension === 'overworld' && state.hasIronPickaxe && anchor &&
            Math.hypot(here.x - anchor.x, here.z - anchor.z) <= 48 &&
            (items.some(item => item.name === 'chest') || (state.hasCraftingTable && state.planks + state.logs * 4 >= 8)))
        return state
    }
    const chest = new Vec3(base.chest.x, base.chest.y, base.chest.z)
    state.baseDistance = here.distanceTo(chest)
    const restock = restockPlan(base.contents || {}, items, worn)
    // A long trip pays only for gear; small refills happen when the bot passes by anyway.
    state.baseRestock = state.baseDistance <= 256 && !state.isNight &&
        (restock.some(entry => GEAR.test(entry.name)) || (state.baseDistance <= 32 && restock.length > 0 && !state.underground))
    const deposit = depositPlan(items, worn)
    state.baseDeposit = calm && state.baseDistance <= 32 &&
        (deposit.some(entry => /diamond|iron|gold|lapis|emerald|redstone|_pickaxe|_sword|_helmet|_chestplate|_leggings|_boots|ender_pearl/.test(entry.name)) ||
            deposit.reduce((n, entry) => n + entry.count, 0) >= 32)
    return state
}

async function placeChest(c) {
    const bot = c.bot
    const feet = bot.entity.position.floored()
    const shaft = new Set((c.memory.shaft?.cells || []).map(p => `${p.x},${p.y},${p.z}`))
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const cell = feet.offset(dx, 0, dz)
        const floor = bot.blockAt(cell.offset(0, -1, 0), false)
        if (shaft.has(`${cell.x},${cell.y},${cell.z}`) || !c.isEmptyPlacementBlock(bot.blockAt(cell, false)) ||
            !c.isEmptyPlacementBlock(bot.blockAt(cell.offset(0, 1, 0), false)) || floor?.boundingBox !== 'block' ||
            ['water', 'lava', 'magma_block'].includes(floor.name)) {
            continue
        }
        await bot.equip(c.bestItem(['chest']), 'hand')
        c.checkAction()
        await bot.placeBlock(floor, new Vec3(0, 1, 0))
        await bot.waitForTicks(4)
        if (bot.blockAt(cell, false)?.name === 'chest') {
            return cell
        }
    }
    throw new Error('no open supported cell beside the bot for a base chest')
}

async function withChest(c, action) {
    const bot = c.bot
    const base = c.memory.base
    const chest = new Vec3(base.chest.x, base.chest.y, base.chest.z)
    if (bot.entity.position.distanceTo(chest.offset(0.5, 0.5, 0.5)) > 3.5) {
        await c.gotoWithTimeout(new goals.GoalNear(chest.x, chest.y, chest.z, 2), 60000, 'base approach')
    }
    c.checkAction()
    const block = bot.blockAt(chest, false)
    if (block?.name !== 'chest') {
        c.log.warn(`Base chest at ${chest} is missing (${block?.name}); forgetting the base.`)
        c.memory.base = null
        throw new Error('base chest missing')
    }
    const window = await bot.openContainer(block)
    try {
        await action(window)
        base.contents = totals(window.containerItems())
    } finally {
        window.close()
    }
}

async function establishBase(c) {
    const bot = c.bot
    const anchor = c.memory.shaft?.dimension === bot.game.dimension ? c.memory.shaft.cells[0] : c.home
    if (anchor && bot.entity.position.distanceTo(new Vec3(anchor.x + 0.5, anchor.y, anchor.z + 0.5)) > 4) {
        await c.gotoWithTimeout(new goals.GoalNear(anchor.x, anchor.y, anchor.z, 2), 30000, 'base site')
    }
    if (!c.hasItem('chest')) {
        await c.ensurePlanks(8)
        await c.ensureItem('chest', 1, true)
    }
    c.checkAction()
    const cell = await placeChest(c)
    c.memory.base = { dimension: bot.game.dimension, chest: { x: cell.x, y: cell.y, z: cell.z }, contents: {} }
    c.log.info(`Base chest placed at ${cell}; surplus will be stored there.`)
    for (const [dx, dz] of [[2, 0], [-2, 0]]) {
        const spot = cell.offset(dx, 0, dz)
        const floor = bot.blockAt(spot.offset(0, -1, 0), false)
        if (c.hasItem('torch') && floor?.boundingBox === 'block' && c.isEmptyPlacementBlock(bot.blockAt(spot, false))) {
            await bot.equip(c.bestItem(['torch']), 'hand')
            await bot.placeBlock(floor, new Vec3(0, 1, 0)).catch(error => c.log.warn(`Base torch failed: ${error.message}`))
        }
    }
    return depositAtBase(c)
}

async function depositAtBase(c) {
    const plan = depositPlan(c.bot.inventory.items(), wornNames(c.bot))
    await withChest(c, async window => {
        for (const { name, count } of plan) {
            c.checkAction()
            const item = c.bot.registry.itemsByName[name]
            await window.deposit(item.id, null, count).catch(error => c.log.warn(`Could not store ${count} ${name}: ${error.message}`))
        }
    })
    c.log.info(`Stored at base: ${plan.map(entry => `${entry.count} ${entry.name}`).join(', ') || 'nothing'}.`)
}

async function restockAtBase(c) {
    let taken = []
    await withChest(c, async window => {
        const stored = totals(window.containerItems())
        taken = restockPlan(stored, c.bot.inventory.items(), wornNames(c.bot))
        for (const { name, count } of taken) {
            c.checkAction()
            const item = c.bot.registry.itemsByName[name]
            await window.withdraw(item.id, null, count).catch(error => c.log.warn(`Could not take ${count} ${name}: ${error.message}`))
        }
    })
    c.log.info(`Restocked from base: ${taken.map(entry => `${entry.count} ${entry.name}`).join(', ') || 'nothing useful stored'}.`)
}

module.exports = { depositPlan, restockPlan, baseState, establishBase, depositAtBase, restockAtBase, placeChest }
