'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const Block = require('prismarine-block')('26.1')
const WorldSync = require('prismarine-world/src/worldsync')
const data = require('minecraft-data')('26.1')
const { reachGoal, choosePillar, climbForLog } = require('../src/tree-climb')
const { SurvivalController } = require('../src/survival-bot')

// Live 01:07Z oak: trunk cut from its base at (-24,69,194) to Y=73, logs left at (-25,74..77,194).
function oakWorld() {
    const cells = new Map()
    const set = (p, name) => cells.set(p.toString(), name)
    for (let x = -30; x <= -18; x++) {
        for (let z = 188; z <= 200; z++) {
            set(new Vec3(x, 68, z), 'grass_block')
        }
    }
    for (let y = 74; y <= 77; y++) {
        set(new Vec3(-25, y, 194), 'oak_log')
    }
    for (const [dx, dz] of [[-1, 0], [0, -1], [0, 1], [-1, 1], [-1, -1]]) {
        set(new Vec3(-25 + dx, 76, 194 + dz), 'oak_leaves')
    }
    const getBlock = p => {
        const b = Block.fromStateId(data.blocksByName[cells.get(p.floored().toString()) || 'air'].defaultState, 0)
        b.position = p.floored()
        return b
    }
    return { cells, set, getBlock, world: { raycast: (...a) => WorldSync.prototype.raycast.call({ getBlock }, ...a) } }
}

// Minimal player physics: 0.42 jump impulse, 0.08 gravity, 0.98 drag, landing on full blocks.
function climbingBot(w, start, inventory) {
    const solid = (x, y, z) => w.getBlock(new Vec3(x, y, z)).boundingBox === 'block'
    const bot = {
        entity: { position: start.clone(), onGround: true, eyeHeight: 1.62, yaw: 0, pitch: 0, vy: 0 },
        controls: {}, entities: {}, dug: [], placed: [], world: w.world, blockAt: w.getBlock,
        inventory: { items: () => inventory.filter(i => i.count > 0) },
        tool: { equipForBlock: async () => {} },
        async equip(item) { bot.held = item },
        setControlState(name, on) { bot.controls[name] = on },
        canDigBlock: b => b.diggable && b.position.offset(0.5, 0.5, 0.5).distanceTo(bot.entity.position.offset(0, 1.65, 0)) <= 5.1,
        canSeeBlock(b) {
            const eye = bot.entity.position.offset(0, 1.62, 0)
            const d = b.position.offset(0.5, 0.5, 0.5).minus(eye)
            return Boolean(w.world.raycast(eye, d.normalize(), d.norm() + 0.01)?.position.equals(b.position))
        },
        async waitForTicks(n) {
            for (let i = 0; i < n; i++) {
                const e = bot.entity
                if (e.onGround && bot.controls.jump) {
                    e.vy = 0.42
                    e.onGround = false
                } else if (!solid(Math.floor(e.position.x), Math.floor(e.position.y) - 1, Math.floor(e.position.z)) ||
                        e.position.y > Math.floor(e.position.y)) {
                    e.onGround = false
                }
                if (e.onGround) {
                    continue
                }
                const next = e.position.y + e.vy
                e.vy = (e.vy - 0.08) * 0.98
                const floor = Math.floor(next)
                if (e.vy < 0 && solid(Math.floor(e.position.x), floor - 1, Math.floor(e.position.z)) && next <= floor + 0.001) {
                    e.position.y = floor
                    e.onGround = true
                    e.vy = 0
                } else if (e.vy < 0 && solid(Math.floor(e.position.x), floor, Math.floor(e.position.z))) {
                    e.position.y = floor + 1
                    e.onGround = true
                    e.vy = 0
                } else {
                    e.position.y = next
                }
            }
        },
        refusals: 0, clearControlStates() { bot.controls = {} }, async look(yaw, pitch) { Object.assign(bot.entity, { yaw, pitch }) },
        async lookAt(p) { bot.lookedAt = p },
        async _placeBlockWithOptions(ref, face) {
            const p = ref.position.plus(face)
            const feetY = bot.entity.position.y
            assert.ok(feetY >= p.y + 1.15, `placed ${p} before the jump peak at y=${feetY}`)
            if (bot.refusals > 0) {
                bot.refusals -= 1
                throw new Error(`Server refused to place ${bot.held.name} at ${p}: the block is still air`)
            }
            assert.ok(bot.held?.count > 0, 'no held scaffold')
            bot.held.count -= 1
            w.set(p, bot.held.name)
            bot.placed.push(p)
        },
        async dig(b) {
            assert.ok(bot.canDigBlock(b), `dig out of reach: ${b.name} at ${b.position}`)
            w.set(b.position, 'air')
            bot.dug.push(b.name + '@' + b.position)
            const drop = b.name === 'grass_block' ? 'dirt' : b.name
            const stack = inventory.find(i => i.name === drop)
            if (b.name.endsWith('_leaves')) {
                return
            }
            if (stack) {
                stack.count += 1
            } else {
                inventory.push({ name: drop, count: 1 })
            }
        }
    }
    return bot
}

function controller(bot) {
    return {
        bot, actionAbort: new AbortController(), log: { info() {}, warn() {} }, checkAction() {},
        async gotoWithTimeout(goal) {
            bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        },
        async collectTarget() {}
    }
}

test('resource approach counts an overhead log within eye reach that the library goal rejects', () => {
    const w = oakWorld()
    const log = new Vec3(-25, 75, 194)
    const node = new Vec3(-24, 69, 194)
    // Eye (-23.5,70.62,194.5) to centre (-24.5,75.5,194.5) is 4.98 blocks: beyond 4.5, so pick Y=74.
    const lower = new Vec3(-25, 74, 194)
    w.set(new Vec3(-25, 73, 194), 'oak_log')
    assert.equal(new goals.GoalLookAtBlock(lower, w.world).isEnd(node), false)
    assert.equal(reachGoal(lower, w.world).isEnd(node), true)
    assert.equal(reachGoal(log, w.world).isEnd(node), false)
})

test('logs above standing reach get a short open pillar column beside the trunk', () => {
    const w = oakWorld()
    const bot = { entity: { position: new Vec3(-20.5, 69, 194.5) }, blockAt: w.getBlock }
    const plan = choosePillar(bot, new Vec3(-25, 77, 194))
    assert.ok(plan, 'expected a pillar plan')
    assert.equal(plan.base.y, 69)
    assert.ok(plan.h >= 2 && plan.h <= 5, `h=${plan.h}`)
    assert.ok(Math.abs(plan.base.x + 25) <= 1 && Math.abs(plan.base.z - 194) <= 1)
    assert.equal(choosePillar(bot, new Vec3(-25, 90, 194)), null)
})

test('the bot pillars up with dirt, cuts every high log, digs the pillar back down and keeps its scaffold', async () => {
    const w = oakWorld()
    const inventory = [{ name: 'dirt', count: 4 }, { name: 'stone_axe', count: 1 }]
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), inventory)
    const dug = await climbForLog(controller(bot), w.getBlock(new Vec3(-25, 74, 194)))
    assert.equal(dug, 4)
    for (let y = 74; y <= 77; y++) {
        assert.equal(w.getBlock(new Vec3(-25, y, 194)).name, 'air')
    }
    assert.ok(bot.placed.length >= 1)
    for (const p of bot.placed) {
        assert.equal(w.getBlock(p).name, 'air', `pillar block left at ${p}`)
    }
    assert.equal(bot.entity.position.y, 69)
    assert.equal(inventory.find(i => i.name === 'dirt').count, 4)
    assert.equal(inventory.find(i => i.name === 'oak_log').count, 4)
})

test('log scaffold beside the trunk is never cut from under the bot and is recovered', async () => {
    const w = oakWorld()
    const inventory = [{ name: 'oak_log', count: 7 }]
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), inventory)
    await climbForLog(controller(bot), w.getBlock(new Vec3(-25, 74, 194)))
    for (let y = 74; y <= 77; y++) {
        assert.equal(w.getBlock(new Vec3(-25, y, 194)).name, 'air')
    }
    assert.equal(bot.entity.position.y, 69)
    assert.equal(inventory.find(i => i.name === 'oak_log').count, 11)
})

test('with no scaffold in hand the bot digs nearby dirt first instead of giving up', async () => {
    const w = oakWorld()
    const inventory = []
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), inventory)
    const c = controller(bot)
    c.collectTarget = async b => bot.dig(b)
    assert.equal(await climbForLog(c, w.getBlock(new Vec3(-25, 74, 194))), 4)
    assert.equal(bot.entity.position.y, 69)
})

test('gather_wood climbs instead of quarantining a tree whose remaining logs are too high', async () => {
    const w = oakWorld()
    const inventory = [{ name: 'dirt', count: 4 }]
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), inventory)
    const log = w.getBlock(new Vec3(-25, 74, 194))
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, controller(bot), { memory: { blockedTargets: new Map() } })
    bot.nearestEntity = () => null
    bot.collectBlock = { findFromVein: () => [log] }
    c.findNearestBlock = () => log
    c.collectTarget = async (target, anchor, label) => {
        if (label === 'tree') {
            throw new Error('No path to the goal!')
        }
    }
    await c.gatherWood()
    assert.equal(c.isBlockedTarget(log), false)
    assert.equal(w.getBlock(new Vec3(-25, 77, 194)).name, 'air')
})

test('a refused pillar placement lands, retries the jump and still finishes the climb', async () => {
    const w = oakWorld()
    const inventory = [{ name: 'dirt', count: 4 }]
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), inventory)
    bot.refusals = 2
    const warnings = []
    const c = controller(bot)
    c.log.warn = m => warnings.push(m)
    assert.equal(await climbForLog(c, w.getBlock(new Vec3(-25, 74, 194))), 4)
    assert.equal(warnings.filter(m => /refused/.test(m)).length, 2)
    assert.equal(bot.entity.position.y, 69)
    assert.equal(inventory.find(i => i.name === 'dirt').count, 4)
})

test('three refusals abandon the climb after digging back down what was placed', async () => {
    const w = oakWorld()
    const inventory = [{ name: 'dirt', count: 4 }]
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), inventory)
    bot.refusals = 3
    const c = controller(bot)
    c.log.warn = () => {}
    await assert.rejects(climbForLog(c, w.getBlock(new Vec3(-25, 74, 194))), /refused/)
    assert.equal(bot.entity.position.y, 69)
    assert.equal(bot.placed.length, 0)
})

test('after descending, the bot collects each settled ground drop without turning and leaves canopy-caught drops', async () => {
    const w = oakWorld()
    const inventory = [{ name: 'dirt', count: 4 }]
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), inventory)
    const drop = (id, x, y, z) => ({ id, name: 'item', isValid: true, position: new Vec3(x, y, z) })
    bot.entities = { 1: drop(1, -26.4, 69, 197.2), 2: drop(2, -22.6, 69, 192.5), 3: drop(3, -24.5, 77.1, 196.5) }
    const c = controller(bot)
    const pickups = []
    c.collectTarget = async ([entity]) => {
        assert.notEqual(bot.lookedAt, entity.position, 'turned toward the drop (F116)')
        pickups.push(entity.id)
        if (entity.id === 2) {
            throw new Error('item pickup timed out after 8s')
        }
        entity.isValid = false
    }
    c.log.warn = () => {}
    await climbForLog(c, w.getBlock(new Vec3(-25, 74, 194)))
    assert.deepEqual(pickups.sort(), [1, 2])
})

test('only zombie-type crowds qualify for a pillar refuge, and only with scaffold and headroom', () => {
    const { pillarSafe } = require('../src/crowd-retreat')
    const w = oakWorld()
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), [{ name: 'cobblestone', count: 8 }])
    const mob = (id, name) => ({ id, name, isValid: true, position: new Vec3(-17.5, 69, 194.5) })
    const c = { bot, hostileNames: new Set(['zombie', 'husk', 'spider', 'skeleton']) }
    bot.entities = { 1: mob(1, 'zombie'), 2: mob(2, 'husk') }
    assert.equal(pillarSafe(c), true)
    bot.entities[3] = mob(3, 'spider')
    assert.equal(pillarSafe(c), false, 'spiders climb pillars')
    bot.entities = { 1: mob(1, 'zombie'), 4: mob(4, 'skeleton') }
    assert.equal(pillarSafe(c), false, 'archers shoot the top')
    bot.entities = { 1: mob(1, 'zombie') }
    const noScaffold = climbingBot(w, new Vec3(-20.5, 69, 194.5), [{ name: 'cobblestone', count: 2 }])
    noScaffold.entities = bot.entities
    assert.equal(pillarSafe({ bot: noScaffold, hostileNames: c.hostileNames }), false)
})

test('a pillar refuge towers three blocks, hits zombies at its base from above, then digs back down', async () => {
    const { pillarRefuge } = require('../src/crowd-retreat')
    const w = oakWorld()
    const inventory = [{ name: 'cobblestone', count: 8 }, { name: 'stone_sword', count: 1 }]
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), inventory)
    Object.defineProperty(bot, 'heldItem', { get: () => bot.held })
    const zombies = [[-19.6, 194.5], [-21.4, 194.5], [-20.5, 195.4]].map(([x, z], i) =>
        ({ id: i + 1, name: 'zombie', isValid: true, height: 1.95, hits: 0, position: new Vec3(x, 69, z) }))
    const hitFrom = []
    Object.assign(bot, { game: { dimension: 'overworld' }, entities: Object.fromEntries(zombies.map(z => [z.id, z])), pathfinder: { setGoal() {} }, clearControlStates() {},
        attack(z) {
            assert.equal(bot.held?.name, 'stone_sword', `hit with ${bot.held?.name}`)
            hitFrom.push(bot.entity.position.y)
            if (++z.hits === 4) { z.isValid = false }
        } })
    const c = controller(bot)
    c.crowdRetreat = { threats: new Map() }
    await pillarRefuge(c)
    assert.ok(zombies.every(z => !z.isValid), 'zombies at the base must be killed from the top')
    assert.ok(hitFrom.every(y => y >= 72), `hit from below the top: ${hitFrom}`)
    assert.equal(bot.entity.position.y, 69)
    assert.equal(inventory.find(i => i.name === 'cobblestone').count, 8)
    assert.equal(c.crowdRetreat, null)
})

test('a skeleton anywhere within 32 blocks rules out the pillar refuge (user rule)', () => {
    const { pillarSafe } = require('../src/crowd-retreat')
    const w = oakWorld()
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), [{ name: 'cobblestone', count: 8 }])
    bot.entities = { 1: { id: 1, name: 'zombie', isValid: true, position: new Vec3(-17.5, 69, 194.5) },
        2: { id: 2, name: 'skeleton', isValid: true, position: new Vec3(-20.5, 69, 222.5) } }
    assert.equal(pillarSafe({ bot, hostileNames: new Set(['zombie', 'skeleton']) }), false)
})

test('a surrounded pillar refuge stays up for the next decision and an arriving archer brings it down', async () => {
    const { pillarRefuge } = require('../src/crowd-retreat')
    const w = oakWorld()
    const inventory = [{ name: 'cobblestone', count: 8 }]
    const bot = climbingBot(w, new Vec3(-20.5, 69, 194.5), inventory)
    const far = { id: 1, name: 'zombie', isValid: true, height: 1.95, position: new Vec3(-24.5, 69, 194.5) }
    Object.assign(bot, { game: { dimension: 'overworld' }, entities: { 1: far }, pathfinder: { setGoal() {} },
        clearControlStates() {}, attack() {} })
    const c = controller(bot)
    await assert.rejects(pillarRefuge(c, 3, 1), /still surrounded/)
    assert.ok(c.pillarState, 'the pillar must be remembered')
    assert.equal(bot.entity.position.y, 72)
    const placedBefore = bot.placed.length
    bot.entities[2] = { id: 2, name: 'skeleton', isValid: true, position: new Vec3(-20.5, 69, 210.5) }
    await assert.rejects(pillarRefuge(c, 3, 5), /archer appeared/)
    assert.equal(bot.placed.length, placedBefore, 'resuming must not tower again')
    assert.equal(bot.entity.position.y, 69)
    assert.equal(c.pillarState, null)
})
