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
        bot: { entity: { position: new Vec3(0.5, 78, 0.5) } }, memory: { scoutVisits: new Map() }, scoutAngle: 0, scoutSteps: 0,
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
