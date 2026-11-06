'use strict'

const { goals } = require('mineflayer-pathfinder')
const { until } = require('./progression-skills')

const ENCHANTER = 'minecraft:story/enchant_item'
const LEATHER_ANIMALS = new Set(['cow', 'mooshroom'])
// Enchanting targets in order of the compounding payoff: Efficiency on a pick speeds all mining.
const TARGETS = ['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'diamond_sword', 'iron_sword']

function enchantingState(c, state) {
    state.sugarCane = c.countItems(['sugar_cane'])
    state.paper = c.countItems(['paper'])
    state.books = c.countItems(['book'])
    state.leather = c.countItems(['leather'])
    state.lapis = c.countItems(['lapis_lazuli'])
    state.xpLevel = c.bot.experience?.level ?? 0
    state.hasEnchantingTable = c.hasItem('enchanting_table') || Boolean(c.findStation?.('enchanting_table', 4))
    return state
}

// Cut the second segment up so the rooted bottom cane regrows; a lone stalk is taken whole.
async function gatherSugarCane(c) {
    const bot = c.bot
    const cane = c.findNearestBlock(name => name === 'sugar_cane', 48, {
        filter: b => bot.blockAt(b.position.offset(0, -1, 0))?.name === 'sugar_cane'
    }) || c.findNearestBlock(name => name === 'sugar_cane', 48)
    if (!cane) {
        return c.scout(32)
    }
    await c.collectTarget(cane, cane, 'sugar cane')
}

async function gatherLeather(c) {
    const animal = c.nearestEntity(LEATHER_ANIMALS, 48)
    if (!animal) {
        return c.scout(32)
    }
    return c.fight(animal, true)
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

module.exports = { enchantingState, gatherSugarCane, gatherLeather, enchantItem, chooseOffer, ENCHANTER }
