'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const {
    SurvivalController,
    mobilityRecoveryKind,
    pathfinderDropLimitForLanding,
    SAFE_PATHFINDER_DROP,
    heapPressureExceeded,
    PATH_SEARCH_RADIUS,
    HEAP_GUARD_BYTES
} = require('../src/survival-bot')

test('ordinary stalled movement does not trigger terrain-changing recovery', () => {
    assert.equal(mobilityRecoveryKind(false, false), null)
})

test('terrain recovery is reserved for detected shafts and isolated pillars', () => {
    assert.equal(mobilityRecoveryKind(true, false), 'shaft')
    assert.equal(mobilityRecoveryKind(false, true), 'elevation')
    assert.equal(mobilityRecoveryKind(true, true), 'shaft')
})

test('pathfinder can take a damage-free two-block drop from a small platform', () => {
    assert.equal(SAFE_PATHFINDER_DROP, 3)
    assert.equal(pathfinderDropLimitForLanding(2), 3)
    assert.equal(pathfinderDropLimitForLanding(3), 4)
    assert.equal(pathfinderDropLimitForLanding(8), 4)
})

test('deep staircase preflight accepts diggable future blocks beyond current reach', () => {
    const bot = {
        blockAt (position) {
            return {
                name: 'stone',
                boundingBox: 'block',
                diggable: true,
                position
            }
        },
        canDigBlock (block) {
            return block.position.distanceTo(new Vec3(0, 1.65, 0)) <= 5.1
        }
    }
    const score = SurvivalController.prototype.stairDirectionScore.call(
        { bot },
        new Vec3(0, 0, 0),
        1,
        0,
        8
    )
    assert.equal(Number.isFinite(score), true)
})

test('pathfinding is bounded and heap pressure trips before the Node limit', () => {
    assert.equal(PATH_SEARCH_RADIUS, 48)
    assert.equal(heapPressureExceeded(HEAP_GUARD_BYTES - 1), false)
    assert.equal(heapPressureExceeded(HEAP_GUARD_BYTES), true)
})

test('safe movements prohibit generic A-star from mining straight down', () => {
    const movements = new (require('mineflayer-pathfinder').Movements)({ registry: require('minecraft-data')('26.1') })
    SurvivalController.prototype.configureSafeMovements(movements)
    const neighbors = []
    movements.getMoveDown({}, neighbors)
    assert.deepEqual(neighbors, [])
    assert.equal(movements.canDig, true)
    assert.deepEqual(movements.scafoldingBlocks, [])
})

test('generic pathfinder digging preserves furnaces and storage containers', () => {
    const registry = require('minecraft-data')('26.1')
    const movements = new (require('mineflayer-pathfinder').Movements)({ registry })
    SurvivalController.prototype.configureSafeMovements(movements)
    for (const name of ['furnace', 'barrel', 'chest']) {
        assert.equal(Boolean(movements.safeToBreak({ type: registry.blocksByName[name].id })), false)
    }
    assert.equal(Boolean(movements.safeToBreak({ type: registry.blocksByName.stone.id })), true)
})

test('a two-deep pit inside roofless shelter walls has a one-step exit', () => {
    // Live respawn 16:27:41Z at a bed: feet y=0 in a 1x1 hole, dirt/grass walls at y=0..1, flat ground beyond.
    const bot = {
        blockAt (p) {
            const ring = Math.max(Math.abs(p.x), Math.abs(p.z))
            const solid = p.y < 0 || (ring === 1 && p.y <= 1) || (ring >= 2 && p.y === 0) || (ring === 0 && p.y < 0)
            return { name: solid ? 'dirt' : 'air', boundingBox: solid ? 'block' : 'empty', diggable: solid, position: p }
        }
    }
    const score = SurvivalController.prototype.stairDirectionScore.call({ bot }, new Vec3(0, 0, 0), 1, 0, 8)
    assert.equal(score, 1)
    const cliffSolid = p => (p.y < 0 && p.x < 2) || (p.x === 1 && p.y <= 1)
    const floating = { blockAt: p => ({ name: cliffSolid(p) ? 'dirt' : 'air', boundingBox: cliffSolid(p) ? 'block' : 'empty', diggable: true, position: p }) }
    assert.equal(SurvivalController.prototype.stairDirectionScore.call({ bot: floating }, new Vec3(0, 0, 0), 1, 0, 8), Infinity)
})

test('repeated navigation failures scout without diagonal steps and restore normal movements', async () => {
    for (const [health, expected] of [[20, 2], [12, 2]]) {
        const active = []
        const original = { name: 'normal' }
        const c = {
            bot: { health, registry: require('minecraft-data')('26.1'), version: '26.1', pathfinder: { setMovements(m) { active.push(m) } } },
            movements: original, log: { warn() {} },
            async scout () {
                const movement = active.at(-1)
                c.dropDuringScout = movement.maxDropDown
                assert.notEqual(movement.getMoveDiagonal, Object.getPrototypeOf(movement).getMoveDiagonal)
                assert.deepEqual(movement.scafoldingBlocks, [])
                assert.equal(movement.canDig, false)
            }
        }
        c.configureSafeMovements = SurvivalController.prototype.configureSafeMovements
        await SurvivalController.prototype.unstick.call(c)
        assert.equal(c.dropDuringScout, expected)
        assert.equal(active.at(-1), original)
    }
})

test('land scouting targets a horizontal area so hills and valleys stay reachable', async () => {
    const { Vec3 } = require('vec3')
    let goal = null
    const c = {
        bot: { entity: { position: new Vec3(0.5, 78, 0.5) }, blockAt: () => null }, memory: { scoutVisits: new Map() }, scoutAngle: 0, scoutSteps: 0,
        log: { info() {} }, classifyTerrainColumn: () => 'land',
        async gotoWithTimeout(g) {
            goal = g
            this.bot.entity.position = new Vec3(g.x, 66, g.z)
        }
    }
    await SurvivalController.prototype.scout.call(c, 20)
    assert.equal(goal.constructor.name, 'GoalNearXZ')
    assert.equal(goal.isEnd({ x: goal.x, y: 66, z: goal.z }), true)
    assert.equal(goal.isEnd({ x: goal.x, y: 90, z: goal.z }), true)
})

test('a walled night shelter on flat ground can be left over the wall with a short drop', () => {
    // Shelter: walls at y=0..1 around the bot, roof at y=2 plus its support at (1,2,0); flat ground outside at y=-1.
    const bot = {
        blockAt (p) {
            const ring = Math.max(Math.abs(p.x), Math.abs(p.z))
            const solid = p.y < 0 || (ring === 1 && p.y <= 1) || (ring === 0 && p.y === 2) || (p.x === 1 && p.z === 0 && p.y === 2)
            return { name: solid ? 'cobblestone' : 'air', boundingBox: solid ? 'block' : 'empty', diggable: solid, position: p }
        }
    }
    assert.equal(Number.isFinite(SurvivalController.prototype.stairDirectionScore.call({ bot }, new Vec3(0, 0, 0), 1, 0, 8)), true)
    const cliff = { blockAt: p => bot.blockAt(p).boundingBox === 'block' && !(p.x >= 2 && p.y < 0 && p.y > -9) ? bot.blockAt(p) : { name: 'air', boundingBox: 'empty', position: p } }
    assert.equal(SurvivalController.prototype.stairDirectionScore.call({ bot: cliff }, new Vec3(0, 0, 0), 1, 0, 8), Infinity)
})

test('a canopy of leaves does not count as being underground, but rock overhead does', () => {
    const { coveredAbove } = require('../src/survival-bot')
    const { Vec3 } = require('vec3')
    const canopy = { blockAt: p => ({ name: p.y >= 70 && p.y <= 72 ? 'oak_leaves' : 'air', boundingBox: p.y >= 70 && p.y <= 72 ? 'block' : 'empty' }) }
    assert.equal(coveredAbove(canopy, new Vec3(0, 67, 0)), false)
    const cave = { blockAt: p => ({ name: p.y === 75 ? 'stone' : 'air', boundingBox: p.y === 75 ? 'block' : 'empty' }) }
    assert.equal(coveredAbove(cave, new Vec3(0, 67, 0)), true)
})

test('three approach timeouts without leaving the spot enter mobility recovery', async () => {
    const c = Object.create(SurvivalController.prototype)
    c.running = true
    c.bot = { health: 20, entity: { position: new Vec3(-33.3, 70, -32.3) } }
    c.observe = () => ({
        health: 20, food: 20, foodUnits: 20, hostileDistance: Infinity, hasCraftingTable: true, hasWoodenPickaxe: true,
        hasEarlySword: true, hasStonePickaxe: true, hasWoodcuttingAxe: true, hasDiggingShovel: true, hasFurnace: true,
        rawIron: 12, ironIngots: 6, logs: 0, planks: 0, sticks: 1, completedAdvancements: new Set()
    })
    c.log = { info() {}, warn() {} }
    c.onState = c.scheduleLoop = () => {}
    c.inventorySummary = () => ''
    c.detectVerticalShaft = c.detectElevationTrap = () => false
    c.failures = new Map()
    c.performWithTimeout = async () => { throw new Error('resource approach timed out after 10s') }
    let recoveries = 0
    let scouts = 0
    c.unstick = async () => { recoveries++ }
    c.scout = async () => { scouts++ }
    for (let i = 0; i < 3; i++) {
        await c.tick()
    }
    assert.equal(recoveries, 1)
    assert.equal(scouts, 0)
})

test('repeated return failures in place or without a path do not trigger drop-down unstick scouting', async () => {
    const c = Object.create(SurvivalController.prototype)
    c.running = true
    c.bot = { health: 20, entity: { position: new Vec3(6.5, 65, 3.5) } }
    c.observe = () => ({ health: 20, food: 20, foodUnits: 0, hostileDistance: Infinity, underground: true, logs: 0, planks: 0,
        completedAdvancements: new Set() })
    c.log = { info() {}, warn() {} }
    c.onState = c.scheduleLoop = () => {}
    c.inventorySummary = () => ''
    c.detectVerticalShaft = c.detectElevationTrap = () => false
    c.failures = new Map()
    c.performWithTimeout = async () => { throw new Error('return stairs blocked and carving requires a pickaxe') }
    let recoveries = 0
    c.unstick = async () => { recoveries++ }
    c.scout = async () => {}
    for (let i = 0; i < 3; i++) {
        await c.tick()
    }
    assert.equal(recoveries, 0)
    c.failures = new Map()
    c.performWithTimeout = async () => { throw new Error('No path to the goal!') }
    for (let i = 0; i < 3; i++) {
        await c.tick()
    }
    assert.equal(recoveries, 0)
})

test('a shaft escape never chooses a staircase through the bot\'s own furnace', async () => {
    const furnace = new Vec3(0, 2, 1)
    const c = Object.create(SurvivalController.prototype)
    const messages = []
    c.log = { info: m => messages.push(m), warn() {} }
    c.bot = {
        entity: { position: new Vec3(0.5, 1, 0.5) },
        blockAt(p) {
            const name = p.equals(furnace) ? 'furnace' : (p.x === 0 && p.z === 0 && p.y >= 1 && p.y <= 2) ? 'air' : 'stone'
            return { name, position: p, boundingBox: name === 'air' ? 'empty' : 'block', diggable: true }
        },
        canDigBlock: () => true, dig: async () => { throw new Error('stop after choosing') }
    }
    c.equipStoneDigTool = async () => {}
    await assert.rejects(c.escapeVerticalShaft(), /stop after choosing/)
    assert.match(messages[0], /toward/)
    assert.doesNotMatch(messages[0], /toward 0,1\./)
})

test('a water search failing three times in place is deferred so the planner turns to other work (live 06:19Z)', async () => {
    const c = Object.create(SurvivalController.prototype)
    c.running = true
    c.memory = {}
    c.bot = { health: 20, entity: { position: new Vec3(305.5, 10, -105.5) } }
    c.observe = () => ({
        health: 20, food: 20, foodUnits: 24, hostileDistance: Infinity, underground: true, logs: 27, planks: 2, sticks: 5,
        cobblestone: 63, hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasWoodcuttingAxe: true, hasDiggingShovel: true, hasFurnace: true, hasIronPickaxe: true, hasDiamondPickaxe: true,
        hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true, hasSmeltingFuel: true,
        gear: new Set(['iron_sword', 'diamond_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']),
        hasBucket: true, hasEmptyBucket: true, waterBuckets: 0, hasLavaBucket: true, diamonds: 0, obsidian: 0,
        rawIron: 4, ironIngots: 5, completedAdvancements: new Set(['minecraft:story/lava_bucket', 'minecraft:story/mine_diamond']),
        waterDeferred: c.memory.waterDeferredUntil > Date.now()
    })
    c.log = { info() {}, warn() {} }
    c.onState = c.scheduleLoop = () => {}
    c.inventorySummary = () => ''
    c.detectVerticalShaft = c.detectElevationTrap = () => false
    c.failures = new Map()
    const actions = []
    c.performWithTimeout = async action => {
        actions.push(action)
        throw new Error('no supported dry tunnel step: 2 unsafe, 4 already excavated, 0 blocked')
    }
    c.unstick = c.scout = async () => assert.fail('a water search must not start drop-down recovery')
    for (let i = 0; i < 4; i++) {
        await c.tick()
    }
    assert.deepEqual(actions.slice(0, 3), ['fill_water_bucket', 'fill_water_bucket', 'fill_water_bucket'])
    assert.notEqual(actions[3], 'fill_water_bucket')
    assert.ok(c.memory.waterDeferredUntil > Date.now())
})

test('a scout starting under open sky never steps under cover, so it cannot walk down its own stairs (F129)', async () => {
    const { Vec3 } = require('vec3')
    // Open sky above y=72 at x <= -50; the bot's staircase runs below the surface east of that.
    const sky = p => p.y >= 72 || p.x <= -50
    const movements = { exclusionAreasStep: [] }
    let during = null
    const c = {
        bot: { entity: { position: new Vec3(-56.5, 72, -84.5) }, blockAt: p => sky(p) ? { name: 'air', boundingBox: 'empty', skyLight: 15 }
            : p.y >= 60 ? { name: 'stone', boundingBox: 'block' } : { name: 'air', boundingBox: 'empty', skyLight: 0 },
            pathfinder: { movements } },
        memory: { scoutVisits: new Map() }, scoutAngle: 0, scoutSteps: 0, log: { info() {} }, classifyTerrainColumn: () => 'land',
        async gotoWithTimeout(g) {
            const step = movements.exclusionAreasStep[0]
            during = { open: step({ position: new Vec3(-56, 72, -85) }), stairs: step({ position: new Vec3(-40, 55, -85) }) }
            this.bot.entity.position = new Vec3(g.x, 72, g.z)
        }
    }
    await SurvivalController.prototype.scout.call(c, 20)
    assert.deepEqual(during, { open: 0, stairs: 100 })
    assert.equal(movements.exclusionAreasStep.length, 0)
    c.bot.entity.position = new Vec3(-40.5, 55, -84.5)
    during = null
    c.gotoWithTimeout = async g => {
        during = movements.exclusionAreasStep.length
        c.bot.entity.position = new Vec3(g.x, 55, g.z)
    }
    await SurvivalController.prototype.scout.call(c, 20)
    assert.equal(during, 0)
})

// Synthetic F134 swamp: dirt floor at y=60, water at y=61..62 for x in [0, 20], dry grass at y=61 beyond x=20.
function swampBot() {
    const registry = require('prismarine-registry')('26.1')
    const Block = require('prismarine-block')(registry)
    const { Vec3 } = require('vec3')
    const name = p => p.y < 60 ? 'stone' : p.y === 60 ? 'dirt' : p.x >= 0 && p.x <= 20 && p.y <= 62 ? 'water'
        : p.x > 20 && p.y === 61 ? 'grass_block' : 'air'
    const bot = {
        registry, version: '26.1', game: { dimension: 'overworld' }, entity: { position: new Vec3(2.5, 61, 0.5), isInWater: true },
        inventory: { items: () => [] },
        blockAt: at => {
            const p = at.floored()
            const b = Block.fromStateId(registry.blocksByName[name(p)].defaultState, 0)
            b.position = p
            b.skyLight = 15
            return b
        }
    }
    return { bot, Vec3 }
}

// The real A* with the bot's 48 search radius, which also caps cost above the start heuristic.
function swim(movements, bot) {
    const AStar = require('mineflayer-pathfinder/lib/astar')
    const Move = require('mineflayer-pathfinder/lib/move')
    const { goals } = require('mineflayer-pathfinder')
    const p = bot.entity.position.floored()
    return new AStar(new Move(p.x, p.y, p.z, 0, 0), movements, new goals.GoalNearXZ(24, 0, 1), 2000, 2000, 48).compute()
}

test('a bot inside a two-deep swamp swims 20 cells to shore within the path cost budget (F134)', async () => {
    const { Movements } = require('mineflayer-pathfinder')
    const { bot } = swampBot()
    const movements = new Movements(bot)
    SurvivalController.prototype.configureSafeMovements.call({ memory: {} }, movements)
    // Live config before F134: one water step cost more than the whole 48 slack the search allows.
    movements.liquidCost = 50
    assert.notEqual(swim(movements, bot).status, 'success')
    SurvivalController.prototype.configureSafeMovements.call({ memory: {} }, movements)
    let result = null
    bot.pathfinder = { movements, goto: async () => { result = swim(movements, bot) } }
    await SurvivalController.prototype.gotoWithTimeout.call({ bot }, null, 1000, 'test swim')
    assert.equal(result.status, 'success')
    assert.ok(result.path.every(node => node.y >= 61), 'no tunnel under the water bed')
    assert.equal(movements.liquidCost, 3, 'the land preference returns after the swim')
    bot.entity.isInWater = false
    await SurvivalController.prototype.gotoWithTimeout.call({ bot }, null, 1000, 'test walk')
    assert.notEqual(result.status, 'success', 'from dry land the same swim stays too costly')
})

test('unstick from inside water does not treat water as a hazard (F134)', async () => {
    const { bot } = swampBot()
    const water = bot.registry.blocksByName.water.id
    let loose = null
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, { bot, log: { warn() {} }, movements: {}, memory: {},
        async scout() { throw new Error('stop after recording movements') } })
    bot.pathfinder = { setMovements(m) { loose ??= m }, setGoal() {} }
    bot.waitForTicks = async () => { throw new Error('stop') }
    await assert.rejects(c.unstick())
    assert.equal(loose.blocksToAvoid.has(water), false)
    assert.equal(swim(loose, bot).status, 'success')
    bot.entity.isInWater = false
    loose = null
    await assert.rejects(c.unstick())
    assert.equal(loose.blocksToAvoid.has(water), true)
})

test('swamp wood targets skip trunk logs beside water instead of blocking the tree (F134)', async () => {
    const { Vec3 } = require('vec3')
    const base = { name: 'oak_log', position: new Vec3(5, 61, 0) }
    const upper = { name: 'oak_log', position: new Vec3(5, 63, 0) }
    let collected = null
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, {
        movements: { safeToBreak: log => log !== base }, actionAbort: new AbortController(), memory: { blockedTargets: new Map() },
        findNearestBlock: (match, range, options) => [base, upper].find(log => match(log.name) && options.filter(log)) ?? null,
        bot: { collectBlock: { findFromVein: () => [base, upper] }, entity: { isInWater: false }, blockAt: () => ({ name: 'air' }) },
        async collectTarget(target) { collected = target }
    })
    await c.gatherWood()
    assert.deepEqual(collected, [upper])
})

test('a bot standing in water treads it by holding jump, but not while a path or a dive controls it (F134)', () => {
    const { EventEmitter } = require('node:events')
    const { Vec3 } = require('vec3')
    const bot = new EventEmitter()
    const controls = {}
    let moving = false
    Object.assign(bot, { entity: { position: new Vec3(0.5, 61, 0.5), isInWater: true }, health: 20, world: { raycast: () => null },
        setControlState: (key, value) => { controls[key] = value }, pathfinder: { isMoving: () => moving } })
    const c = { bot, running: true, busy: true, activeAction: 'gather_wood', log: { warn() {}, info() {} }, standingOff: () => false,
        canSee: () => false, cancelCurrentTask() {} }
    SurvivalController.prototype.bindEvents.call(c)
    bot.emit('physicsTick')
    assert.equal(controls.jump, true)
    moving = true
    controls.jump = 'pathfinder'
    bot.emit('physicsTick')
    assert.equal(controls.jump, false, 'released once for the path')
    controls.jump = 'pathfinder'
    bot.emit('physicsTick')
    assert.equal(controls.jump, 'pathfinder', 'then left to the path')
    moving = false
    c.activeAction = 'surface_for_air'
    bot.emit('physicsTick')
    assert.equal(controls.jump, 'pathfinder')
    c.activeAction = 'gather_wood'
    bot.emit('physicsTick')
    bot.entity.isInWater = false
    bot.emit('physicsTick')
    assert.equal(controls.jump, false)
})

test('a wood attempt cut off by low air blocks the whole tree (F134)', async () => {
    const { Vec3 } = require('vec3')
    const logs = [61, 62, 63].map(y => ({ name: 'oak_log', position: new Vec3(5, y, 0) }))
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, {
        movements: { safeToBreak: () => true }, actionAbort: new AbortController(), memory: { blockedTargets: new Map() },
        findNearestBlock: () => logs[1], nearestEntity: () => null,
        bot: { collectBlock: { findFromVein: () => logs }, entity: { isInWater: false }, blockAt: () => ({ name: 'air' }) },
        async collectTarget() {
            c.actionAbort.abort('low air supply')
            throw new Error('collection cancelled')
        }
    })
    await assert.rejects(c.gatherWood(), /collection cancelled/)
    assert.deepEqual([...c.memory.blockedTargets.keys()].sort(), ['5,61,0', '5,62,0', '5,63,0'])
})

test('after spawning the planner reaches land first, after air and threats (F135)', () => {
    const { chooseAction } = require('../src/decision-engine')
    const state = { health: 20, food: 20, hostileDistance: Infinity, needsLand: true, completedAdvancements: new Set() }
    assert.equal(chooseAction(state), 'reach_land')
    assert.equal(chooseAction({ ...state, oxygen: 10 }), 'surface_for_air')
    assert.equal(chooseAction({ ...state, hostileDistance: 3, hasWeapon: true }), 'fight')
    assert.notEqual(chooseAction({ ...state, needsLand: false }), 'reach_land')
})

function landWorld() {
    const { Vec3 } = require('vec3')
    const registry = require('prismarine-registry')('26.1')
    const Block = require('prismarine-block')(registry)
    // Swamp from x=0..20 (water y=61..62 over dirt y=60); grass shore at y=61 from x=21.
    const name = p => p.y < 60 ? 'stone' : p.y === 60 ? 'dirt' : p.x <= 20 && p.y <= 62 ? 'water' : p.x > 20 && p.y === 61 ? 'grass_block' : 'air'
    const bot = {
        registry, game: { dimension: 'overworld' }, entity: { position: new Vec3(3.5, 61, 0.5), onGround: false, isInWater: true },
        blockAt: at => {
            const p = at.floored()
            const b = Block.fromStateId(registry.blocksByName[name(p)].defaultState, 0)
            b.position = p
            return b
        },
        findBlocks ({ matching, maxDistance, count, useExtraInfo }) {
            const found = []
            for (let x = -10; x <= 40; x++) {
                for (let y = 55; y <= 66; y++) {
                    const b = bot.blockAt(new Vec3(x, y, 0))
                    if (matching.includes(b.type) && b.position.distanceTo(bot.entity.position) <= maxDistance && useExtraInfo(b)) {
                        found.push(b.position)
                    }
                }
            }
            return found.sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position)).slice(0, count)
        }
    }
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, { bot, landPending: true, landFailures: 0, actionAbort: new AbortController(), log: { info() {}, warn() {} },
        memory: { blockedTargets: new Map() }, checkAction() {} })
    return { c, bot, Vec3 }
}

test('the reach-land goal heads for the nearest dry ground block and clears once standing on it (F135)', async () => {
    const { c, bot, Vec3 } = landWorld()
    assert.equal(c.needsLand(), true)
    let goal = null
    c.gotoWithTimeout = async g => {
        goal = g
        Object.assign(bot.entity, { position: new Vec3(g.x + 0.5, g.y, g.z + 0.5), onGround: true, isInWater: false })
    }
    await c.reachLand()
    assert.deepEqual([goal.x, goal.y, goal.z], [22, 62, 0], 'dry shore one cell from the water, not the dirt under it')
    assert.equal(c.needsLand(), false)
    assert.equal(c.landPending, false)
})

test('a reach-land goal with no loaded ground scouts, and gives up after six attempts (F135)', async () => {
    const { c, bot } = landWorld()
    bot.findBlocks = () => []
    let scouts = 0
    c.scout = async () => { scouts++ }
    for (let i = 0; i < 5; i++) {
        await c.reachLand()
    }
    assert.equal(scouts, 5)
    assert.equal(c.landPending, true)
    await c.reachLand()
    assert.equal(c.landPending, false)
    c.bot.game.dimension = 'the_nether'
    c.landPending = true
    assert.equal(c.needsLand(), false, 'the goal is Overworld-only')
})

test('a dry pocket below the swamp surface is not land; the dry shore is (F135)', async () => {
    const { c, bot, Vec3 } = landWorld()
    const blockAt = bot.blockAt
    const air = blockAt(new Vec3(30, 70, 0))
    // Live 06:15Z: dirt at y=60 with air above but water on every side looked like land.
    bot.blockAt = at => {
        const p = at.floored()
        return p.x === 5 && p.z === 0 && (p.y === 61 || p.y === 62) ? Object.assign(Object.create(air), { position: p }) : blockAt(at)
    }
    let goal = null
    c.gotoWithTimeout = async g => {
        goal = g
        Object.assign(bot.entity, { position: new Vec3(g.x + 0.5, g.y, g.z + 0.5), onGround: true, isInWater: false })
    }
    await c.reachLand()
    assert.deepEqual([goal.x, goal.y, goal.z], [22, 62, 0])
})

test('after swimming to land the bot stocks sixteen soil blocks before wood (F135)', async () => {
    const { chooseAction } = require('../src/decision-engine')
    const { c, bot, Vec3 } = landWorld()
    let carried = 0
    c.countItems = () => carried
    c.gotoWithTimeout = async g => Object.assign(bot.entity, { position: new Vec3(g.x + 0.5, g.y, g.z + 0.5), onGround: true, isInWater: false })
    await c.reachLand()
    assert.equal(c.needsLand(), false)
    assert.equal(c.needsBlockStock(), true)
    assert.equal(chooseAction({ health: 20, food: 20, hostileDistance: Infinity, stockBlocks: true, completedAdvancements: new Set() }), 'stock_blocks')
    const soil = { name: 'grass_block', position: new Vec3(25, 61, 0) }
    c.findNearestBlock = (match, range, options) => match(soil.name) && options.filter(soil) ? soil : null
    c.collectTarget = async block => { assert.equal(block, soil); carried += 1 }
    await c.stockBlocks()
    assert.equal(carried, 1)
    carried = 16
    assert.equal(c.needsBlockStock(), false)
    const { c: dry } = landWorld()
    Object.assign(dry.bot.entity, { position: new Vec3(25.5, 62, 0.5), onGround: true, isInWater: false })
    assert.equal(dry.needsLand(), false)
    assert.equal(dry.needsBlockStock(), false, 'spawning on land needs no stock')
})

test('a trunk ringed by water gets a block on the water surface to stand on (F135)', async () => {
    const { c, bot, Vec3 } = landWorld()
    const blockAt = bot.blockAt
    const trunk = p => p.x === 5 && p.z === 0 && p.y >= 61 && p.y <= 66
    bot.blockAt = at => {
        const p = at.floored()
        if (trunk(p)) {
            const registry = bot.registry
            const b = require('prismarine-block')(registry).fromStateId(registry.blocksByName.oak_log.defaultState, 0)
            b.position = p
            return b
        }
        return blockAt(at)
    }
    const placed = []
    const visits = []
    Object.assign(c, { bestItem: () => ({ name: 'dirt' }),
        async placeSurvivalBlock(p) { placed.push(p.toString()) },
        async gotoWithTimeout(g, ms, label) { visits.push([label, g.x, g.y, g.z]) } })
    const target = bot.blockAt(new Vec3(5, 64, 0))
    assert.equal(await c.buildLogPlatform(target), true)
    assert.equal(placed.length, 1)
    const [x, y, z] = placed[0].slice(1, -1).split(', ').map(Number)
    assert.equal(y, 62, 'on the water surface')
    assert.equal(Math.abs(x - 5) + Math.abs(z), 1, 'beside the trunk')
    assert.deepEqual(visits.at(-1), ['log platform', x, 63, z])
    c.bestItem = () => null
    await assert.rejects(c.buildLogPlatform(target), /no block to stand on/)
})
