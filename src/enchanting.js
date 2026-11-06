'use strict'

const { goals } = require('mineflayer-pathfinder')
const { until } = require('./progression-skills')

const ENCHANTER = 'minecraft:story/enchant_item'
const LEATHER_ANIMALS = new Set(['cow', 'mooshroom'])
// Enchanting targets in order of the compounding payoff: Efficiency on a pick speeds all mining.
const TARGETS = ['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'diamond_sword', 'iron_sword']
const SCOUT_BUDGET = 8
const DEFER_MS = 15 * 60000

function enchantingState(c, state) {
    state.sugarCane = c.countItems(['sugar_cane'])
    state.paper = c.countItems(['paper'])
    state.books = c.countItems(['book'])
    state.leather = c.countItems(['leather'])
    state.lapis = c.countItems(['lapis_lazuli'])
    state.xpLevel = c.bot.experience?.level ?? 0
    state.hasEnchantingTable = c.hasItem('enchanting_table') || Boolean(c.findStation?.('enchanting_table', 4))
    state.enchanterDeferred = c.memory.enchanterDeferredUntil > Date.now()
    return state
}

// Scouting for cows is unbounded terrain search; after a budget the branch yields.
async function gatherLeather(c) {
    const animal = c.nearestEntity(LEATHER_ANIMALS, 48)
    if (animal) {
        c.memory.leatherScouts = 0
        return c.fight(animal, true)
    }
    c.memory.leatherScouts = (c.memory.leatherScouts || 0) + 1
    if (c.memory.leatherScouts >= SCOUT_BUDGET) {
        c.memory.leatherScouts = 0
        c.memory.enchanterDeferredUntil = Date.now() + DEFER_MS
        c.log.warn(`No cows after ${SCOUT_BUDGET} scouts; deferring Enchanter for ${DEFER_MS / 60000} min.`)
        return
    }
    return c.scout(32)
}

// Without bookshelves the three offers need levels 1-2, 1-6 and 1-8 and cost 1-3 lapis
// and levels; the best affordable offer is taken.
function chooseOffer(levels, xpLevel, lapis) {
    let best = -1
    for (let i = 0; i < 3; i++) {
        if (levels[i] > 0 && levels[i] <= xpLevel && i + 1 <= lapis) {
            best = i
        }
    }
    return best
}

async function enchantItem(c) {
    const bot = c.bot
    const plain = item => {
        try {
            return !item.enchants?.length
        } catch {
            return true
        }
    }
    const tool = TARGETS.map(name => bot.inventory.items().find(item => item.name === name && plain(item))).find(Boolean)
    const lapis = bot.inventory.items().find(item => item.name === 'lapis_lazuli')
    if (!tool || !lapis) {
        throw new Error(tool ? 'lapis lazuli is missing' : 'no unenchanted pickaxe or sword to enchant')
    }
    const block = await c.getStation('enchanting_table')
    if (bot.entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) > 4) {
        await c.gotoWithTimeout(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2), 8000, 'enchanting table')
    }
    c.checkAction()
    const table = await bot.openEnchantmentTable(block)
    try {
        await table.putTargetItem(tool)
        await table.putLapis(lapis)
        // The library's 'ready' event also fires on all-zero levels, so wait for real offers.
        await until(c, () => table.enchantments.some(slot => slot.level > 0), 3000)
        const levels = table.enchantments.map(slot => slot.level)
        const choice = chooseOffer(levels, bot.experience.level, table.slots[1]?.count || 0)
        if (choice < 0) {
            throw new Error(`no affordable offer: levels ${levels.join('/')} at experience level ${bot.experience.level}`)
        }
        await table.enchant(choice)
        await until(c, () => c.advancements.completed.has(ENCHANTER), 5000)
        c.log.info(`Enchanted ${tool.name} with offer ${choice + 1} (level ${levels[choice]}); Enchanter confirmed by the server.`)
        await table.takeTargetItem()
    } finally {
        await bot.closeWindow(table)
    }
    await c.reclaimStation(block).catch(error => c.log.warn(`Could not reclaim the enchanting table: ${error.message}`))
}

module.exports = { enchantingState, gatherLeather, enchantItem, chooseOffer, ENCHANTER }
