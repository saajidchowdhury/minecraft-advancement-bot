'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { safeFooting, findCaveRoute, exploreCave, collectOpportunity, findPriorityDiamond, minedPassage } = require('../src/cave-exploration')
const { performProgression } = require('../src/progression-skills')

function caveWorld() {
    const blocks = new Map()
    const inventory = [{ name: 'torch', count: 16 }, { name: 'iron_pickaxe', type: 1, count: 1 }]
    const state = { dimension: 'overworld', health: 20, food: 20, foodUnits: 12,
        armorEquipped: true, shieldEquipped: true, hostileDistance: Infinity, logs: 2, planks: 0 }
    const moves = []
    const original = { safeToBreak: () => true }
    const c = {
        memory: {}, running: true, paused: false, actionAbort: new AbortController(), movements: original,
        observe: () => state, log: { info() {} }, isBlockedTarget: () => false, rememberBlockedTarget() {}, checkAction() {},
        bestItem: names => inventory.find(item => names.includes(item.name)),
        countItems: names => inventory.filter(item => names.includes(item.name)).reduce((sum, item) => sum + item.count, 0),
        findNearestBlock: () => null,
        bot: {
            registry: require('minecraft-data')('26.1'), health: 20,
            game: { dimension: 'overworld', minY: -64 }, entity: { position: new Vec3(0.5, 64, 0.5), yaw: 0, pitch: 0 },
            inventory: { emptySlotCount: () => 10, items: () => inventory },
            findBlock({ matching, point, maxDistance, useExtraInfo }) {
                return [...blocks.keys()].map(key => c.bot.blockAt(new Vec3(...key.slice(1, -1).split(',').map(Number))))
                    .filter(b => matching.includes(c.bot.registry.blocksByName[b.name].id) &&
                        b.position.distanceTo(point) <= maxDistance && useExtraInfo(b))
                    .sort((a, b) => a.position.distanceTo(point) - b.position.distanceTo(point))[0] || null
            },
            blockAt(p) {
                const name = blocks.has(p.toString()) ? blocks.get(p.toString()) : (p.y < 64 || p.y >= 70 ? 'stone' : 'air')
                const light = Math.max(0, ...[...blocks].filter(([, value]) => value === 'torch').map(([key]) => {
                    const source = new Vec3(...key.slice(1, -1).split(',').map(Number))
                    return 14 - Math.abs(source.x - p.x) - Math.abs(source.y - p.y) - Math.abs(source.z - p.z)
                }))
                return name === null ? null : { name, position: p, light, boundingBox: ['air', 'torch'].includes(name) ? 'empty' : 'block' }
            },
            pathfinder: { setGoal() {}, setMovements(m) { c.activeMovements = m } },
            equip: async () => {}, look: async () => {}, waitForTicks: async () => {},
            async placeBlock(floor) {
                assert.equal(c.activeMovements.canDig, false)
                blocks.set(floor.position.offset(0, 1, 0).toString(), 'torch')
                inventory.find(item => item.name === 'torch').count--
            }
        },
        async gotoWithTimeout(goal) {
            assert.equal(c.activeMovements.canDig, false)
            assert.equal(c.activeMovements.allowParkour, false)
            assert.deepEqual(c.activeMovements.scafoldingBlocks, [])
            moves.push(new Vec3(goal.x, goal.y, goal.z))
            c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        }
    }
    return { c, blocks, inventory, state, moves, original }
}

test('a large cave offers a bounded connected walk before more tunneling', () => {
    const { c } = caveWorld()
    const route = findCaveRoute(c.bot, new Map(), -54)
    assert.ok(route.length > 0 && route.length <= 8)
    let from = c.bot.entity.position.floored()
    for (const p of route) {
        assert.equal(Math.abs(p.x - from.x) + Math.abs(p.z - from.z), 1)
        assert.ok(Math.abs(p.y - from.y) <= 1)
        assert.equal(safeFooting(c.bot, p), true)
        from = p
    }
})

test('cave surveys honor the water search cover restriction before walking', async () => {
    const { c, moves } = caveWorld()
    assert.equal(await exploreCave(c, 64, () => false), false)
    assert.equal(moves.length, 0)
})

test('cave discovery rejects surface terrain and one-block tunnels', () => {
    const { c } = caveWorld()
    const blockAt = c.bot.blockAt
    c.bot.blockAt = p => p.y >= 70 ? { name: 'air', boundingBox: 'empty' } : blockAt(p)
    assert.deepEqual(findCaveRoute(c.bot, new Map(), 16), [])
    c.bot.blockAt = p => p.z !== 0 ? { name: 'stone', boundingBox: 'block' } : blockAt(p)
    assert.deepEqual(findCaveRoute(c.bot, new Map(), 16), [])
})

test('DFS follows a narrow mineshaft and backtracks through checkpoints to the other branch', () => {
    const { c } = caveWorld()
    c.bot.entity.position = new Vec3(4.5, 64, 0.5)
    c.bot.blockAt = p => {
        const corridor = p.z === 0 && p.x >= 0 && p.x <= 8
        const name = corridor && p.y === 64 ? 'rail' : corridor && p.y === 65 ? 'cave_air' : 'stone'
        return { name, position: p, boundingBox: name === 'stone' ? 'block' : 'empty' }
    }
    const checkpoints = new Map()
    const first = findCaveRoute(c.bot, checkpoints, -54)
    assert.equal(first.length, 4)
    for (const p of [c.bot.entity.position.floored(), ...first]) {
        checkpoints.set(`overworld:${p}`, 1000)
    }
    c.bot.entity.position = first.at(-1).offset(0.5, 0, 0.5)
    const second = findCaveRoute(c.bot, checkpoints, -54)
    assert.equal(second.length, 8)
    assert.equal(second[3].x, 4)
    assert.equal(second.at(-1).x, first.at(-1).x === 0 ? 8 : 0)
})

test('cave footing rejects unloaded terrain, liquids, spikes and deep-dark triggers', () => {
    const { c, blocks } = caveWorld()
    const p = new Vec3(0, 64, 0)
    for (const name of [null, 'water', 'lava', 'pointed_dripstone', 'sculk_shrieker', 'sculk_sensor']) {
        blocks.set(p.offset(1, 0, 0).toString(), name)
        assert.equal(safeFooting(c.bot, p), false)
    }
    blocks.clear()
    blocks.set(p.offset(0, -1, 0).toString(), 'magma_block')
    assert.equal(safeFooting(c.bot, p), false)
    blocks.set(p.offset(0, -1, 0).toString(), 'air')
    assert.equal(safeFooting(c.bot, p), false)
})

test('cave search prefers natural steps toward the requested ore depth', () => {
    const { c } = caveWorld()
    c.bot.blockAt = p => {
        const floorY = 63 - Math.max(0, Math.min(p.x, 5))
        const solid = p.y <= floorY || p.y >= 70
        return { name: solid ? 'stone' : 'air', position: p, boundingBox: solid ? 'block' : 'empty' }
    }
    const route = findCaveRoute(c.bot, new Map(), -54)
    assert.ok(route.length > 0)
    assert.ok(route.at(-1).y < 64)
})

test('saved cave checkpoints stay explored and are scoped to the dimension', () => {
    const { c } = caveWorld()
    const visits = new Map()
    for (let x = -12; x <= 12; x++) {
        for (let z = -12; z <= 12; z++) {
            visits.set(`overworld:${new Vec3(x, 64, z)}`, 1000)
        }
    }
    assert.deepEqual(findCaveRoute(c.bot, visits, 16), [])
    c.bot.game.dimension = 'the_nether'
    assert.ok(findCaveRoute(c.bot, visits, 16).length > 0)
    c.bot.game.dimension = 'overworld'
    assert.deepEqual(findCaveRoute(c.bot, visits, 16), [])
    assert.deepEqual(findCaveRoute(c.bot, new Map(), 16, () => true), [])
})

test('a cave survey lights supported steps, saves return waypoints and restores movement policy', async () => {
    const { c, moves, original } = caveWorld()
    c.bot.inventory.emptySlotCount = () => 4
    assert.equal(await exploreCave(c, 16), true)
    assert.ok(moves.length > 0 && moves.length <= 8)
    assert.equal(c.memory.mineRoute.length, moves.length)
    assert.equal(c.memory.mineRoute[0].x, 0)
    assert.equal(c.activeMovements, original)
    assert.ok(c.memory.caveVisits.size > 0)
})

test('cave exploration yields to insufficient supplies, threats and equipment preparation', async () => {
    for (const change of [{ health: 15 }, { food: 17 }, { foodUnits: 0 }, { armorEquipped: false },
        { shieldEquipped: false }, { hostileDistance: 10 }, { dimension: 'the_nether' }]) {
        const { c, state, moves } = caveWorld()
        Object.assign(state, change)
        assert.equal(await exploreCave(c, 16), false)
        assert.equal(moves.length, 0)
    }
    const { c, inventory } = caveWorld()
    inventory[0].count = 0
    assert.equal(await exploreCave(c, 16), false)
})

test('cancellation during torch equip sends no placement or movement', async () => {
    const { c, moves, original } = caveWorld()
    c.bot.equip = async () => c.actionAbort.abort()
    c.bot.placeBlock = async () => assert.fail('placement after cancellation')
    await assert.rejects(exploreCave(c, 16), /cancelled/)
    assert.equal(moves.length, 0)
    assert.equal(c.activeMovements, original)
})

test('failed cave movement retains a return anchor, quarantines the target and restores policy', async () => {
    const { c, original } = caveWorld()
    let remembered = false
    c.gotoWithTimeout = async () => { throw new Error('blocked passage') }
    c.rememberBlockedTarget = () => { remembered = true }
    await assert.rejects(exploreCave(c, 16), /blocked passage/)
    assert.equal(remembered, true)
    assert.equal(c.activeMovements, original)
    assert.equal(c.memory.mineRoute.length, 1)
})

test('a newly approaching hostile ends the survey before another step', async () => {
    const { c, moves, state } = caveWorld()
    const go = c.gotoWithTimeout
    c.gotoWithTimeout = async goal => { await go(goal); state.hostileDistance = 8 }
    assert.equal(await exploreCave(c, 16), true)
    assert.equal(moves.length, 1)
})

test('a newly visible diamond interrupts the cave walk at the next checkpoint', async () => {
    const { c, moves, state } = caveWorld()
    const go = c.gotoWithTimeout
    c.gotoWithTimeout = async goal => { await go(goal); state.diamondInView = true }
    assert.equal(await exploreCave(c, -54), true)
    assert.equal(moves.length, 1)
    assert.ok(c.memory.caveVisits.has(`overworld:${moves[0]}`))
})

test('opportunistic ores respect reserves, tool tier and inventory headroom', async () => {
    const { c, inventory } = caveWorld()
    const target = { name: 'deepslate_gold_ore', position: new Vec3(2, 64, 0), canHarvest: type => type === 1 }
    let collected = 0
    c.findNearestBlock = (predicate, radius, options) => predicate(target.name) && options.filter(target) ? target : null
    c.collectTarget = async block => { assert.equal(block, target); collected++ }
    assert.equal(await collectOpportunity(c), true)
    inventory.push({ name: 'raw_gold', count: 8 })
    assert.equal(await collectOpportunity(c), false)
    inventory.pop()
    assert.equal(await collectOpportunity(c, ['gold_ore', 'deepslate_gold_ore']), false)
    target.canHarvest = () => false
    assert.equal(await collectOpportunity(c), false)
    target.canHarvest = () => true
    c.bot.inventory.emptySlotCount = () => 4
    assert.equal(await collectOpportunity(c), false)
    assert.equal(collected, 1)
})

test('opportunistic coal stops at 32 and iron follows the observed reserve cap', async () => {
    const { c, inventory, state } = caveWorld()
    let target = { name: 'coal_ore', position: new Vec3(2, 64, 0), canHarvest: () => true }
    c.findNearestBlock = (predicate, radius, options) => predicate(target.name) && options.filter(target) ? target : null
    c.collectTarget = async () => {}
    inventory.push({ name: 'coal', count: 31 })
    assert.equal(await collectOpportunity(c), true)
    inventory.at(-1).count = 32
    assert.equal(await collectOpportunity(c), false)
    target = { name: 'iron_ore', position: new Vec3(2, 64, 0), canHarvest: () => true }
    inventory.push({ name: 'raw_iron', count: 1 }, { name: 'iron_ingot', count: 10 })
    Object.assign(state, { rawIron: 1, ironIngots: 10, ironInFurnace: 29 })
    state.ironCap = 41
    assert.equal(await collectOpportunity(c), true)
    state.ironCap = 40
    assert.equal(await collectOpportunity(c), false)
})

test('the real diamond action surveys a cave instead of digging when no requested ore is exposed', async () => {
    const { c, moves } = caveWorld()
    c.bot.dig = async () => assert.fail('resumed tunneling before surveying cave')
    await performProgression(c, 'gather_diamonds', {})
    assert.ok(moves.length > 0)
})

test('survey work has a shared step budget rather than exploring indefinitely', async () => {
    const { c, moves } = caveWorld()
    c.memory.caveSurvey = { dimension: 'overworld', startedAt: Date.now(), steps: 47 }
    assert.equal(await exploreCave(c, 16), true)
    assert.equal(moves.length, 1)
    assert.equal(await exploreCave(c, 16), false)
    c.memory.caveSurvey.startedAt -= 120001
    assert.equal(await exploreCave(c, 16), true)
})

test('unconfirmed lighting stops the survey before moving into darkness', async () => {
    const { c, moves, original } = caveWorld()
    c.bot.placeBlock = async () => {}
    await assert.rejects(exploreCave(c, 16), /not confirmed/)
    assert.equal(moves.length, 0)
    assert.equal(c.activeMovements, original)
})

test('large caverns with high ceilings still receive a survey', () => {
    const { c } = caveWorld()
    c.bot.blockAt = p => ({ name: p.y < 64 || p.y >= 110 ? 'stone' : 'air', position: p,
        boundingBox: p.y < 64 || p.y >= 110 ? 'block' : 'empty' })
    assert.ok(findCaveRoute(c.bot, new Map(), -54).length > 0)
})

test('a cave survey spaces torches instead of lighting every step', async () => {
    const { c, blocks, inventory, state, moves } = caveWorld()
    c.findNearestBlock = (match, distance) => [...blocks].map(([key, name]) => ({ name, p: new Vec3(...key.slice(1, -1).split(',').map(Number)) }))
        .find(b => match(b.name) && b.p.distanceTo(c.bot.entity.position.floored()) <= distance) || null
    assert.equal(await exploreCave(c, 16), true)
    assert.ok(moves.length >= 4)
    assert.ok(16 - inventory.find(item => item.name === 'torch').count <= Math.ceil(moves.length / 7))
})

test('survey lighting uses the light level when an earlier torch is outside the forward view', async () => {
    const { c, inventory, moves } = caveWorld()
    c.findNearestBlock = () => null
    assert.equal(await exploreCave(c, 16), true)
    assert.ok(moves.length >= 4)
    assert.ok(16 - inventory.find(item => item.name === 'torch').count <= Math.ceil(moves.length / 7))
})

test('cave torches stay ten blocks apart even when light readings remain zero', async () => {
    const { c, blocks } = caveWorld()
    const blockAt = c.bot.blockAt
    c.bot.blockAt = p => ({ ...blockAt(p), light: 0, skyLight: 0 })
    await exploreCave(c, 16)
    await exploreCave(c, 16)
    const torches = [...blocks].filter(([, name]) => name === 'torch')
        .map(([key]) => new Vec3(...key.slice(1, -1).split(',').map(Number)))
    assert.ok(torches.length > 0)
    for (const [index, a] of torches.entries()) {
        assert.ok(torches.slice(index + 1).every(b => a.distanceTo(b) >= 10))
    }
})

test('a torch within ten blocks prevents placement and exactly ten blocks is allowed', async () => {
    for (const [distance, expected] of [[0, 0], [9, 0], [10, 1]]) {
        const { c, blocks, inventory, moves } = caveWorld()
        blocks.set(new Vec3(-distance, 64, 0).toString(), 'wall_torch')
        const blockAt = c.bot.blockAt
        c.bot.blockAt = p => ({ ...blockAt(p), light: 0, skyLight: 0 })
        const goto = c.gotoWithTimeout
        c.gotoWithTimeout = async goal => {
            await goto(goal)
            c.observe = () => ({ dimension: 'overworld', health: 1 })
        }
        await exploreCave(c, 16)
        assert.equal(moves.length, 1)
        assert.equal(16 - inventory.find(item => item.name === 'torch').count, expected)
    }
})

test('ore excavation is remembered as an artificial passage before a survey', async () => {
    const { c, blocks } = caveWorld()
    const { rememberMiningExposure } = require('../src/cave-exploration')
    for (let x = -12; x <= 12; x++) {
        for (let z = -12; z <= 12; z++) {
            const position = new Vec3(x, 64, z)
            rememberMiningExposure(c, { name: 'coal_ore', position })
        }
    }
    assert.equal(await exploreCave(c, 16), false)
    assert.equal(blocks.size, 0)
})

test('cave surveys reject passages the bot already excavated, including legacy memory', async () => {
    for (const legacy of [false, true]) {
        const { c, moves } = caveWorld()
        c.memory.minedCells = new Set()
        for (let x = -12; x <= 12; x++) {
            for (let z = -12; z <= 12; z++) {
                const p = new Vec3(x, 64, z)
                c.memory.minedCells.add(legacy ? p.toString() : `overworld:${p}`)
            }
        }
        c.bot.game.dimension = 'the_nether'
        assert.equal(Boolean(minedPassage(c, new Vec3(1, 64, 0))), false)
        c.bot.game.dimension = 'overworld'
        assert.equal(await exploreCave(c, 16), false)
        assert.equal(moves.length, 0)
    }
})

function diamondWorld(extra = {}) {
    const { oreSeen } = require('../src/cave-exploration')
    // Main tunnel x=0,z=0..5 (feet/head y=64..65); probe hole at head height x=1..3,z=0.
    const names = new Map([[new Vec3(2, 65, 1).toString(), 'deepslate_diamond_ore'], ...Object.entries(extra)])
    const blockAt = p => {
        const open = (p.x === 0 && p.z >= 0 && p.z <= 5 && (p.y === 64 || p.y === 65)) || (p.y === 65 && p.z === 0 && p.x >= 1 && p.x <= 3)
        const name = names.get(p.toString()) || (open ? 'air' : 'deepslate')
        return { name, position: p, boundingBox: ['air', 'water', 'glow_lichen'].includes(name) ? 'empty' : 'block', canHarvest: () => true }
    }
    const bot = {
        entity: { position: new Vec3(0.5, 64, 0.5), yaw: -Math.PI / 2 }, game: { dimension: 'overworld' }, blockAt,
        inventory: { items: () => [{ name: 'iron_pickaxe', type: 1 }] },
        world: {
            raycast(from, dir, range) {
                for (let t = 0; t <= range; t += 0.01) {
                    const point = from.plus(dir.scaled(t))
                    const b = blockAt(point.floored())
                    if (b.boundingBox === 'block') {
                        // Mirror prismarine-world: an intersection point and no position.
                        return { name: b.name, intersect: point }
                    }
                }
                return null
            }
        },
        canSeeBlock: b => bot.world.raycast(bot.entity.position.offset(0, 1.62, 0), b.position.offset(0.5, 0.5, 0.5).minus(bot.entity.position.offset(0, 1.62, 0)).normalize(), 16)?.intersect.floored().equals(b.position)
    }
    const c = {
        bot, memory: {},
        findNearestBlock(match, range, options = {}) {
            const found = []
            for (let x = -range; x <= range; x++) {
                for (let y = -4; y <= 4; y++) {
                    for (let z = -range; z <= range; z++) {
                        const b = blockAt(new Vec3(x, 64 + y, z))
                        if (match(b.name) && (!options.sight || options.sight(b)) && (!options.filter || options.filter(b))) {
                            found.push(b)
                        }
                    }
                }
            }
            return found[0] || null
        }
    }
    return { c, bot, oreSeen }
}

test('a diamond seen only by the face beside a probe hole still counts as in view', () => {
    const { c, bot, oreSeen } = diamondWorld()
    const ore = bot.blockAt(new Vec3(2, 65, 1))
    assert.equal(bot.canSeeBlock(ore), false)
    assert.equal(oreSeen(bot, ore), true)
    assert.equal(oreSeen(bot, bot.blockAt(new Vec3(2, 65, 2))), false)
    assert.deepEqual(findPriorityDiamond(c).position, ore.position)
})

test('a cached diamond behind stone stays hidden and concealed water does not rule out visible ore', () => {
    const hidden = new Vec3(4, 65, -1)
    const { c } = diamondWorld({ '(2, 65, 1)': 'deepslate', [hidden.toString()]: 'diamond_ore' })
    c.memory.knownOres = [{ x: hidden.x, y: hidden.y, z: hidden.z, dimension: 'overworld', at: Date.now() }]
    assert.equal(findPriorityDiamond(c), null)
    const wet = diamondWorld({ [new Vec3(2, 66, 1).toString()]: 'water' })
    assert.ok(findPriorityDiamond(wet.c))
})

test('a clear diamond in line of sight is found whichever way the bot faces (F116)', () => {
    const { c, bot } = diamondWorld()
    assert.ok(findPriorityDiamond(c))
    bot.entity.yaw += Math.PI
    assert.ok(findPriorityDiamond(c))
})

test('an ore face covered by glow lichen is still in view', () => {
    const { bot, oreSeen } = diamondWorld({ [new Vec3(2, 65, 0).toString()]: 'glow_lichen' })
    assert.equal(oreSeen(bot, bot.blockAt(new Vec3(2, 65, 1))), true)
})
