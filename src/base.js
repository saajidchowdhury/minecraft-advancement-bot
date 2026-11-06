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
    for (const kind of ['pickaxe', 'sword', 'axe', 'shovel']) {
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

const GEAR = /_(pickaxe|sword|axe|helmet|chestplate|leggings|boots)$|^shield$/

function wornNames(bot) {
    const slots = bot.inventory.slots
    return { helmet: slots[5]?.name, chestplate: slots[6]?.name, leggings: slots[7]?.name, boots: slots[8]?.name, offhand: slots[45]?.name }
}

const SOLID = new Set(['stone', 'deepslate', 'cobblestone', 'cobbled_deepslate', 'tuff', 'granite', 'diorite', 'andesite', 'calcite', 'dirt'])
const CARDINAL = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// Vault layout from the tunnel cell F the bot stands in, facing d: niche N = F+d (feet and
// head), chest V = F+2d. V is closed by natural rock on every face but N, and N is sealed
// with two cobblestone after each visit, so a creeper blast breaks at most the outer layer.
function vaultSite(bot, feet) {
    const solid = p => SOLID.has(bot.blockAt(p, false)?.name)
    const wet = p => [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
        .some(([x, y, z]) => ['water', 'lava', 'bubble_column'].includes(bot.blockAt(p.offset(x, y, z), false)?.name))
    for (const [dx, dz] of CARDINAL) {
        const n = feet.offset(dx, 0, dz)
        const v = feet.offset(2 * dx, 0, 2 * dz)
        const shell = [v.offset(dx, 0, dz), v.offset(dz, 0, dx), v.offset(-dz, 0, -dx), v.offset(0, 1, 0), v.offset(0, -1, 0),
            n.offset(dz, 0, dx), n.offset(-dz, 0, -dx), n.offset(dz, 1, dx), n.offset(-dz, 1, -dx), n.offset(0, 2, 0), n.offset(0, -1, 0)]
        if ([n, n.offset(0, 1, 0), v, ...shell].every(solid) && ![n, v].some(wet)) {
            return { door: feet, niche: n, chest: v, dir: [dx, dz] }
        }
    }
    return null
}

function baseState(c, state) {
    const bot = c.bot
    const base = c.memory.base
    const here = bot.entity.position
    const items = bot.inventory.items()
    const worn = wornNames(bot)
    // The vault sits underground, so night is no obstacle there; surface work still waits for day.
    const calm = state.hostileDistance > 12 && (state.underground || !state.isNight)
    if (!base || base.dimension !== bot.game.dimension) {
        state.baseEstablish = Boolean(calm && state.underground && bot.game.dimension === 'overworld' && state.hasIronPickaxe &&
            (items.some(item => item.name === 'barrel') || (state.hasCraftingTable && state.planks + state.logs * 4 >= 9)) &&
            state.cobblestone >= 2 && vaultSite(bot, here.floored()))
        return state
    }
    const chest = new Vec3(base.chest.x, base.chest.y, base.chest.z)
    state.baseDistance = here.distanceTo(chest)
    if (!base.door || base.container !== 'barrel') {
        // Surface chests sit exposed, and a chest under rock cannot open; rebuild as a barrel vault.
        state.baseMigrate = (state.underground || !state.isNight) && state.hostileDistance > 12 && state.baseDistance <= 64
        return state
    }
    const restock = restockPlan(base.contents || {}, items, worn)
    // A long trip pays only for gear; small refills happen when the bot passes by anyway.
    state.baseRestock = state.baseDistance <= 256 && (state.underground || !state.isNight) &&
        (restock.some(entry => GEAR.test(entry.name)) || (state.baseDistance <= 32 && restock.length > 0))
    const deposit = depositPlan(items, worn)
    state.baseDeposit = calm && state.baseDistance <= 32 &&
        (deposit.some(entry => /diamond|iron|gold|lapis|emerald|redstone|_pickaxe|_sword|_helmet|_chestplate|_leggings|_boots|ender_pearl/.test(entry.name)) ||
            deposit.reduce((n, entry) => n + entry.count, 0) >= 32)
    return state
}

async function digIfSolid(c, p) {
    const bot = c.bot
    const block = bot.blockAt(p, false)
    if (block && block.boundingBox !== 'empty' && !['chest', 'barrel'].includes(block.name)) {
        await bot.tool?.equipForBlock(block, { requireHarvest: true, getFromChest: false })
        c.checkAction()
        await bot.dig(block, true)
        c.checkAction()
    }
}

async function seal(c, base) {
    const n = new Vec3(base.niche.x, base.niche.y, base.niche.z)
    if (c.countItems(['cobblestone', 'cobbled_deepslate']) < 2) {
        c.log.warn('Too little cobblestone to reseal the base vault; leaving it open.')
        return
    }
    await c.placeSurvivalBlock(n)
    await c.placeSurvivalBlock(n.offset(0, 1, 0))
    base.sealed = true
}

async function withChest(c, action) {
    const bot = c.bot
    const base = c.memory.base
    const chest = new Vec3(base.chest.x, base.chest.y, base.chest.z)
    if (base.door) {
        const door = new Vec3(base.door.x, base.door.y, base.door.z)
        if (!bot.entity.position.floored().equals(door)) {
            await c.gotoWithTimeout(new goals.GoalBlock(door.x, door.y, door.z), 60000, 'base approach')
        }
        const n = new Vec3(base.niche.x, base.niche.y, base.niche.z)
        await digIfSolid(c, n.offset(0, 1, 0))
        await digIfSolid(c, n)
        base.sealed = false
    } else if (bot.entity.position.distanceTo(chest.offset(0.5, 0.5, 0.5)) > 3.5) {
        await c.gotoWithTimeout(new goals.GoalNear(chest.x, chest.y, chest.z, 2), 60000, 'base approach')
    }
    c.checkAction()
    const block = bot.blockAt(chest, false)
    if (block?.name !== (base.container || 'chest')) {
        c.log.warn(`Base container at ${chest} is missing (${block?.name}); forgetting the base.`)
        c.memory.base = null
        throw new Error('base chest missing')
    }
    const window = await bot.openContainer(block)
    try {
        await action(window)
        base.contents = totals(window.containerItems())
    } finally {
        window.close()
        if (base.door) {
            await seal(c, base)
        }
    }
}

async function establishBase(c) {
    const bot = c.bot
    const site = vaultSite(bot, bot.entity.position.floored())
    if (!site) {
        throw new Error('no solid, dry rock beside the tunnel for a base vault')
    }
    // A chest cannot open with a solid block on top; a barrel opens fully enclosed, so the vault
    // keeps its rock roof. Barrel: six planks and two slabs of any wood.
    if (!c.hasItem('barrel')) {
        await c.ensurePlanks(9)
        const planks = bot.inventory.items().filter(item => item.name.endsWith('_planks')).sort((a, b) => b.count - a.count)[0]
        await c.ensureItem(planks.name.replace('_planks', '_slab'), 2, true)
        await c.ensureItem('barrel', 1, true)
    }
    c.checkAction()
    const [dx, dz] = site.dir
    await digIfSolid(c, site.niche.offset(0, 1, 0))
    await digIfSolid(c, site.niche)
    await digIfSolid(c, site.chest)
    await bot.equip(c.bestItem(['barrel']), 'hand')
    await bot.placeBlock(bot.blockAt(site.chest.offset(dx, 0, dz), false), new Vec3(-dx, 0, -dz))
    await bot.waitForTicks(4)
    if (bot.blockAt(site.chest, false)?.name !== 'barrel') {
        throw new Error(`base barrel placement at ${site.chest} was not confirmed`)
    }
    const plain = p => ({ x: p.x, y: p.y, z: p.z })
    c.memory.base = { dimension: bot.game.dimension, container: 'barrel', chest: plain(site.chest), niche: plain(site.niche), door: plain(site.door), contents: {}, sealed: false }
    c.log.info(`Base vault built at ${site.chest}: barrel in solid rock, niche ${site.niche} sealed after each visit.`)
    if (c.hasItem('torch')) {
        // A wall torch at head height lights the doorway without sitting where the bot stands.
        for (const [px, pz] of [[-dx, -dz], [dz, dx], [-dz, -dx]]) {
            const wall = bot.blockAt(site.door.offset(px, 1, pz), false)
            if (wall?.boundingBox === 'block') {
                await bot.equip(c.bestItem(['torch']), 'hand')
                await bot.placeBlock(wall, new Vec3(-px, 0, -pz)).catch(error => c.log.warn(`Base torch failed: ${error.message}`))
                break
            }
        }
    }
    return depositAtBase(c)
}

// Move an exposed pre-vault surface chest: take everything, pick the chest up, and let the
// next underground stop build a sealed vault for the items.
async function migrateBase(c) {
    const bot = c.bot
    const base = c.memory.base
    const above = new Vec3(base.chest.x, base.chest.y + 1, base.chest.z)
    if ((base.container || 'chest') === 'chest' && bot.blockAt(above, false)?.boundingBox === 'block') {
        if (bot.entity.position.distanceTo(above.offset(0.5, 0.5, 0.5)) > 4) {
            await c.gotoWithTimeout(new goals.GoalNear(above.x, above.y, above.z, 2), 30000, 'base approach')
        }
        await digIfSolid(c, above)
    }
    await withChest(c, async window => {
        for (const item of window.containerItems()) {
            c.checkAction()
            await window.withdraw(item.type, null, item.count).catch(error => c.log.warn(`Could not take ${item.count} ${item.name}: ${error.message}`))
        }
    })
    const chest = bot.blockAt(new Vec3(base.chest.x, base.chest.y, base.chest.z), false)
    if (['chest', 'barrel'].includes(chest?.name)) {
        // The pathfinder's movement rules refuse to break chests, so collectTarget cannot be used.
        await bot.tool?.equipForBlock(chest, { requireHarvest: true, getFromChest: false })
        c.checkAction()
        await bot.dig(chest, true)
        await bot.waitForTicks(6)
        const drop = Object.values(bot.entities || {}).find(e => e.isValid && e.name === 'item' && e.position.distanceTo(chest.position.offset(0.5, 0, 0.5)) <= 3)
        if (drop) {
            const p = drop.position.floored()
            await c.gotoWithTimeout(new goals.GoalNear(p.x, p.y, p.z, 0), 4000, 'chest pickup').catch(() => {})
        }
    }
    c.memory.base = null
    c.log.info('Emptied the old base; a sealed underground barrel vault will replace it.')
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

// Take a specific item for a one-off build (the golem's iron) without a full restock.
async function withdrawItem(c, name, count) {
    const base = c.memory.base
    if (!base || base.dimension !== c.bot.game.dimension || !(base.contents?.[name] > 0)) {
        return
    }
    await withChest(c, async window => {
        const stored = window.containerItems().filter(item => item.name === name).reduce((n, item) => n + item.count, 0)
        const n = Math.min(stored, count)
        if (n > 0) {
            await window.withdraw(c.bot.registry.itemsByName[name].id, null, n)
        }
    })
}

module.exports = { depositPlan, restockPlan, baseState, vaultSite, establishBase, migrateBase, depositAtBase, restockAtBase, withdrawItem }
