'use strict'

// Carry rules for freeing slots (F115, user direction 2026-11-12). Whole stacks are thrown once a rule's
// limit is met, so a rule keeps at least its limit. Items with no rule have no planned use and are thrown;
// copper and gunpowder are junk on purpose.
// Seals and shelters want blast-resistant stone; dirt (resistance 0.5) is kept apart for pillars.
const BUILDING = ['cobblestone', 'cobbled_deepslate', 'blackstone', 'netherrack']
const GROUPS = [
    { key: 'building', match: name => BUILDING.includes(name), limit: 64, order: name => Number(name === 'netherrack') },
    { key: 'logs', match: name => /_(log|wood|stem|hyphae)$/.test(name), limit: 40 },
    { key: 'planks', match: name => name.endsWith('_planks'), limit: 64 },
    { key: 'fuel', match: name => name === 'coal' || name === 'charcoal', limit: 32 },
    { key: 'gold', match: name => name === 'raw_gold' || name === 'gold_ingot', limit: 8 },
    { key: 'slabs', match: name => name.endsWith('_slab'), limit: 2 },
    { key: 'beds', match: name => name.endsWith('_bed'), limit: 1 }
]
const SINGLE = {
    dirt: 16, stick: 64, torch: 32, gravel: 16, flint: 4, redstone: 16, lapis_lazuli: 8, string: 5, feather: 4,
    arrow: 64, wheat: 16, mushroom_stew: 4, crafting_table: 1, furnace: 1, barrel: 1, chest: 1,
    enchanting_table: 1, book: 1, paper: 3, sugar_cane: 3, pumpkin: 1, carved_pumpkin: 1, iron_block: 4,
    shield: 1, bow: 1, fishing_rod: 1, shears: 1, flint_and_steel: 1,
    raw_copper: 0, copper_ingot: 0, gunpowder: 0, red_mushroom: 0, brown_mushroom: 0, bowl: 0
}
const KEEP_ALL = new Set(['diamond', 'raw_iron', 'iron_ingot', 'obsidian', 'bucket', 'water_bucket', 'lava_bucket', 'ender_pearl',
    'ender_eye', 'blaze_rod', 'blaze_powder', 'golden_apple', 'enchanted_golden_apple', 'totem_of_undying', 'ancient_debris',
    'netherite_scrap', 'netherite_ingot'])
const BAD_FOOD = new Set(['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish', 'suspicious_stew'])
const GEAR_TIERS = ['wooden', 'leather', 'golden', 'chainmail', 'stone', 'iron', 'diamond', 'netherite']
const TOOL_KEEP = { pickaxe: 2, sword: 1, axe: 1, shovel: 1, hoe: 1 }
const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots']
const gearTier = name => GEAR_TIERS.indexOf(name.split('_')[0])
const remaining = item => (item.maxDurability || 0) - (item.durabilityUsed || 0)

// rule := [group key, limit, sort] for an item; limit 0 throws every stack.
function rule(name, worn, foods, limits = {}) {
    const piece = name.split('_').at(-1)
    if (Object.hasOwn(SINGLE, name)) {
        return [name, SINGLE[name]]
    }
    const group = GROUPS.find(g => g.match(name))
    if (group) {
        return [group.key, limits[group.key] ?? group.limit, group.order]
    }
    if (KEEP_ALL.has(name)) {
        return [name, Infinity]
    }
    if (Object.hasOwn(TOOL_KEEP, piece) && gearTier(name) >= 0) {
        return [`tool:${piece}`, TOOL_KEEP[piece], null, true]
    }
    if (ARMOR_PIECES.includes(piece) && gearTier(name) >= 0) {
        const current = worn.find(w => w.endsWith(`_${piece}`))
        return [`armor:${piece}`, 1, null, true, current ? gearTier(current) : -1]
    }
    if (foods[name] && !BAD_FOOD.has(name)) {
        return [name, Infinity]
    }
    return [name, 0]
}

// Stacks to throw: junk, gear outclassed by better gear carried or worn, and stacks beyond carry limits.
function discardableStacks(items, { worn = [], foods = {}, limits = {} } = {}) {
    const groups = new Map()
    for (const item of items) {
        const [key, limit, order, gear, wornTier] = rule(item.name, worn, foods, limits)
        if (!groups.has(key)) {
            groups.set(key, { limit, order, gear, wornTier, stacks: [] })
        }
        groups.get(key).stacks.push(item)
    }
    const surplus = []
    for (const { limit, order, gear, wornTier, stacks } of groups.values()) {
        const sorted = gear
            ? [...stacks].sort((a, b) => gearTier(b.name) - gearTier(a.name) || remaining(b) - remaining(a))
            : [...stacks].sort((a, b) => (order ? order(a.name) - order(b.name) : 0) || b.count - a.count)
        let kept = 0
        for (const item of sorted) {
            if (kept < limit && !(gear && wornTier !== undefined && gearTier(item.name) <= wornTier)) {
                kept += gear ? 1 : item.count
            } else {
                surplus.push(item)
            }
        }
    }
    return surplus
}

function discardableStack(items, context) {
    return discardableStacks(items, context)[0] || null
}

// Clean only when nearly full, then throw every discardable stack at once: cleaning at four free
// slots re-ran after every tunnel segment and cost 20% of a mining run (live 06:42Z).
const CLEANUP_FREE_SLOTS = 2

function needsCleanup(freeSlots, discardable) {
    return freeSlots === 0 || (freeSlots <= CLEANUP_FREE_SLOTS && Boolean(discardable))
}

const TOOL = /_(pickaxe|sword|axe|shovel|hoe)$|^(shears|flint_and_steel|bucket|water_bucket|lava_bucket|shield|bow|crossbow|fishing_rod)$/
const TIER = ['netherite', 'diamond', 'iron', 'golden', 'stone', 'wooden']

function overflowStack(items, foods) {
    const priority = name => {
        if (TOOL.test(name) || /_(helmet|chestplate|leggings|boots|bed)$|^(crafting_table|furnace)$/.test(name)) {
            return 4
        }
        if (/^(obsidian|diamond|ancient_debris|netherite_scrap|netherite_ingot)$/.test(name)) {
            return 3
        }
        if (foods[name] || /_(log|wood|stem|hyphae|planks)$|^(stick|torch|coal|charcoal|raw_iron|iron_ingot)$/.test(name)) {
            return 2
        }
        return BUILDING.includes(name) || name === 'dirt' || name === 'gravel' ? 1 : 0
    }
    return [...items].sort((a, b) => priority(a.name) - priority(b.name) || a.count - b.count)[0]
}

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

// Bare hands break a pickaxe block in 5 s per hardness unit without a drop: stone 7.5 s, deepslate 15 s.
const BARE_HAND_MAX_HARDNESS = 3.5
const WOOD_SUFFIXES = ['_log', '_stem', '_wood', '_hyphae']

// No carried pickaxe, and carried wood and stone cannot craft a stone or wooden one.
function pickaxeStranded(items) {
    if (items.some(item => item.name.endsWith('_pickaxe'))) {
        return false
    }
    const count = test => items.filter(item => test(item.name)).reduce((n, item) => n + item.count, 0)
    const planks = count(name => name.endsWith('_planks')) + 4 * count(name => WOOD_SUFFIXES.some(s => name.endsWith(s)))
    const needed = (count(name => name === 'stick') >= 2 ? 0 : 2) + (count(name => name === 'crafting_table') ? 0 : 4) +
        (count(name => ['cobblestone', 'cobbled_deepslate', 'blackstone'].includes(name)) >= 3 ? 0 : 3)
    return planks < needed
}

// Ores are left alone: a bare-hand break destroys them without a drop.
function handDiggable(block) {
    return Boolean(block?.diggable) && block.hardness != null && block.hardness <= BARE_HAND_MAX_HARDNESS && !block.name.endsWith('_ore')
}

module.exports = { discardableStack, discardableStacks, needsCleanup, overflowStack, inventoryReport, pickaxeStranded, handDiggable }
