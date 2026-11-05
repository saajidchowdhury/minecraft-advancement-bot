'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { golemState, golemSite, summonGolem } = require('../src/golem')

function golemWorld(items) {
    const blocks = new Map([[new Vec3(6, 64, 0).toString(), 'pumpkin']])
    const completed = new Set()
    const placed = []
    const inv = { ...items }
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), memory: {}, log: { info() {} },
        advancements: { completed }, checkAction() {},
        hasItem: name => inv[name] > 0, hasAnyItem: names => names.some(n => inv[n] > 0), countItems: names => names.reduce((n, k) => n + (inv[k] || 0), 0),
        bestItem: names => ({ name: names.find(n => inv[n] > 0) }),
        findNearestBlock: match => match('pumpkin') && blocks.get(new Vec3(6, 64, 0).toString()) === 'pumpkin' ? { name: 'pumpkin', position: new Vec3(6, 64, 0) } : null,
        async ensureItem(name, count) {
            if (name === 'shears') { inv.iron_ingot -= 2; inv.shears = 1 }
            if (name === 'iron_block') { inv.iron_ingot -= 36; inv.iron_block = 4 }
        },
        async gotoWithTimeout() {},
        async collectTarget(block) { blocks.set(block.position.toString(), 'air'); inv.carved_pumpkin = 1 },
        bot: {
            entity: { position: new Vec3(0.5, 64, 0.5) },
            blockAt: p => {
                const name = blocks.get(p.toString()) || (p.y < 64 ? 'grass_block' : 'air')
                return { name, position: p, boundingBox: ['air', 'short_grass'].includes(name) ? 'empty' : 'block' }
            },
            equip: async () => {},
            async activateBlock(block) { if (block.name === 'pumpkin') { blocks.set(block.position.toString(), 'carved_pumpkin') } },
            async placeBlock(ref, face) {
                const p = ref.position.plus(face)
                const name = c.__holding
                blocks.set(p.toString(), name)
                placed.push([name, p.toString()])
                if (name === 'carved_pumpkin') { completed.add('minecraft:adventure/summon_iron_golem') }
            }
        }
    }
    c.bot.equip = async item => { c.__holding = item.name }
    return { c, placed, inv, blocks }
}

test('the golem site keeps the T, the head and both lower corners clear on solid ground', () => {
    const { c, blocks } = golemWorld({})
    const site = golemSite(c.bot, new Vec3(0, 64, 0))
    assert.deepEqual(site, new Vec3(2, 64, 0))
    blocks.set(new Vec3(1, 64, 0).toString(), 'stone')
    assert.notDeepEqual(golemSite(c.bot, new Vec3(0, 64, 0)), new Vec3(2, 64, 0))
})

test('summoning shears a pumpkin, crafts iron blocks, builds the T and places the head last', async () => {
    const { c, placed, inv } = golemWorld({ iron_ingot: 38 })
    await summonGolem(c)
    assert.equal(inv.shears, 1)
    assert.deepEqual(placed.map(p => p[0]), ['iron_block', 'iron_block', 'iron_block', 'iron_block', 'carved_pumpkin'])
    assert.ok(c.advancements.completed.has('minecraft:adventure/summon_iron_golem'))
})

test('the golem waits for full iron armor, enough iron including the base, a pumpkin and calm daylight', () => {
    const { c } = golemWorld({})
    const calm = { completedAdvancements: new Set(), dimension: 'overworld', underground: false, isNight: false, hostileDistance: Infinity,
        armorPoints: 15, hasCraftingTable: true, ironIngots: 38 }
    assert.equal(golemState(c, { ...calm }).canSummonGolem, true)
    assert.equal(golemState(c, { ...calm, armorPoints: 9 }).canSummonGolem, false)
    assert.equal(golemState(c, { ...calm, ironIngots: 10 }).canSummonGolem, false)
    c.memory.base = { contents: { iron_ingot: 30 } }
    assert.equal(golemState(c, { ...calm, ironIngots: 10 }).canSummonGolem, true)
    assert.equal(golemState(c, { ...calm, isNight: true }).canSummonGolem, false)
})
