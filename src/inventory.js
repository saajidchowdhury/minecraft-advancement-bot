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

const TOOL = /_(pickaxe|sword|axe|shovel|hoe)$|^(shears|flint_and_steel|bucket|water_bucket|lava_bucket|shield|bow|crossbow|fishing_rod)$/
const TIER = ['netherite', 'diamond', 'iron', 'golden', 'stone', 'wooden']

function described(item) {
    if (!item.maxDurability) {
        return item.count > 1 ? `${item.count} ${item.name}` : item.name
    }
    return `${item.name} ${Math.round(100 * (item.maxDurability - (item.durabilityUsed || 0)) / item.maxDurability)}%`
}

// Chat lines for !inventory; the server rejects chat messages over 256 characters.
function inventoryReport(items, worn) {
    const rank = name => TIER.findIndex(tier => name.startsWith(`${tier}_`))
    const tools = items.filter(item => TOOL.test(item.name))
        .sort((a, b) => a.name.split('_').at(-1).localeCompare(b.name.split('_').at(-1)) || rank(a.name) - rank(b.name))
    const counts = {}
    for (const item of items.filter(item => !TOOL.test(item.name))) {
        counts[item.name] = (counts[item.name] || 0) + item.count
    }
    const rest = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${count} ${name}`)
    const lines = [
        `Tools: ${tools.map(described).join(', ') || 'none'}`,
        `Worn: ${Object.entries(worn).filter(([, item]) => item).map(([slot, item]) => `${slot} ${described(item)}`).join(', ') || 'nothing'}`
    ]
    let line = 'Items:'
    for (const [i, entry] of rest.entries()) {
        const more = ` +${rest.length - i} more`
        if (line.length + entry.length + 2 > 240 - (lines.length === 3 ? more.length : 0)) {
            if (lines.length === 3) {
                line += more
                break
            }
            lines.push(line)
            line = 'Items:'
        }
        line += `${line.endsWith(':') ? ' ' : ', '}${entry}`
    }
    lines.push(rest.length ? line : 'Items: none')
    return lines
}

module.exports = { discardableStack, discardableStacks, inventoryReport }
