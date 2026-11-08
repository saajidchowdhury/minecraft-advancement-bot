'use strict'

const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { plugin: collectBlockPlugin } = require('mineflayer-collectblock')
const { Vec3 } = require('vec3')
const { createRng } = require('./random')
const { Actions, chooseAction, canSustainFight, outnumbered, hasMiningWood } = require('./decision-engine')
const { RECIPES, nextAdvancement, ironPickPlankFuel, ironReserveCap } = require('./advancement-plan')
const { chooseLandCandidate, isIsolatedPillar } = require('./terrain-scout')
const { updateNightState, retreatForNight, wornArmorPoints } = require('./night-policy')
const { prepareBed, sleepSafely, leaveShelter, clearPlants, wakeWithOwner } = require('./night-skills')
const { AdvancementTracker } = require('./advancement-tracker')
const { FOOD_VALUES, MIN_MINING_MEALS, mealReserve, foodState, foodOpportunity, cookFood, pickGlowBerries, huntFish, waitForFish } = require('./food')
const { exploreCave, collectOpportunity, findPriorityDiamond, findPriorityOre, IRON_ORES, miningSight, dryMovements, safeFooting,
    rememberMiningExposure, exposedByDig } = require('./cave-exploration')
const { inView, blockInView, canSeeBlock, sightRay, scanFor } = require('./vision')
const { findNearbyLoot, lootChest } = require('./loot')
const { discardableStack, inventoryReport } = require('./inventory')
const { baseState, establishBase, migrateBase, depositAtBase, restockAtBase } = require('./base')
const { farmingState, fishingState, breedingState, plantSeed, goFish, breedAnimals } = require('./farming')
const { archeryState, shootArrow } = require('./archery')
const { enchantingState, gatherLeather, enchantItem } = require('./enchanting')
const { golemState, summonGolem } = require('./golem')
const { performProgression, redstonePlan, mineTunnel, until, climbStep, armorUpgrades, miningPickaxe, followShaft, coveredAbove, openToSky, PROTECTED_CONTAINERS, WOODCUTTING_AXES, DIGGING_SHOVELS } = require('./progression-skills')
const { updateCrowdRetreat, retreatToWall, mineFromRefuge } = require('./crowd-retreat')
const { reachGoal, treePillar, climbForLog } = require('./tree-climb')

const { GoalNear, GoalFollow } = goals

const HOSTILES = new Set([
    'zombie', 'husk', 'drowned', 'skeleton', 'stray', 'creeper', 'spider',
    'cave_spider', 'witch', 'pillager', 'vindicator', 'evoker', 'ravager',
    'slime', 'magma_cube', 'phantom', 'guardian', 'elder_guardian',
    'warden', 'blaze', 'ghast', 'piglin_brute', 'hoglin', 'zoglin', 'wither_skeleton'
])

const PREY = new Set(['cow', 'pig', 'sheep', 'chicken', 'rabbit'])
const WEAPONS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword',
    'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'golden_axe', 'wooden_axe']

const LOG_SUFFIXES = ['_log', '_stem', '_wood', '_hyphae']
const CREEPERS = new Set(['creeper'])
const ARCHERS = new Set(['skeleton', 'stray', 'bogged', 'pillager'])
const WATER_BLOCKS = new Set(['water', 'bubble_column', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass'])
const BUILDING_BLOCKS = ['cobblestone', 'cobbled_deepslate', 'dirt', 'netherrack']
const SAFE_DESCENT_BLOCKS = new Set([
    'dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mycelium',
    'mud', 'clay', 'sand', 'red_sand', 'gravel', 'snow_block'
])
const RECOVERY_WINDOW_MS = 4.5 * 60 * 1000
// Pathfinder measures from the bot's feet to the landing block, so a value of
// three permits a two-block fall. That is damage-free in vanilla Minecraft and
// lets the bot step off small player-built platforms without enabling cliff jumps.
const SAFE_PATHFINDER_DROP = 3
// Limit A* detours beyond the direct goal heuristic. Unlimited searches with
// digging enabled can branch through millions of underground block states.
const PATH_SEARCH_RADIUS = 48
const HEAP_GUARD_BYTES = 768 * 1024 * 1024
const HUNT_AXE_COOLDOWN_MS = Object.freeze({ wooden_axe: 1250, stone_axe: 1250, copper_axe: 1250,
    iron_axe: 1112, golden_axe: 1000, diamond_axe: 1000, netherite_axe: 1000 })
const ACTION_TIMEOUT_MS = Object.freeze({
    [Actions.ESCAPE]: 30000,
    [Actions.REFUGE]: 30000,
    avoid_enderman: 30000,
    [Actions.DESCEND]: 30000,
    [Actions.ASCEND]: 90000,
    [Actions.RECOVER]: 90000,
    [Actions.FIGHT]: 30000,
    [Actions.EAT]: 15000,
    [Actions.WOOD]: 90000,
    [Actions.CRAFT_TABLE]: 30000,
    [Actions.CRAFT_WOODEN_PICKAXE]: 30000,
    [Actions.STONE]: 90000,
    [Actions.CRAFT_STONE_PICKAXE]: 30000,
    [Actions.CRAFT_STONE_AXE]: 30000,
    [Actions.CRAFT_STONE_SHOVEL]: 30000,
    [Actions.CRAFT_FURNACE]: 30000,
    [Actions.FOOD]: 60000,
    [Actions.COAL]: 90000,
    [Actions.IRON]: 90000,
    [Actions.SMELT_IRON]: 60000,
    [Actions.CRAFT_IRON_PICKAXE]: 30000,
    smelt_charcoal: 45000, craft_progression: 45000, equip_armor: 10000, equip_shield: 10000,
    fill_water_bucket: 90000, fill_lava_bucket: 90000, gather_diamonds: 90000, gather_obsidian: 90000,
    gather_flint: 60000, gather_redstone: 90000, enter_nether: 180000,
    clear_inventory: 30000, mine_diamond: 45000, loot_chest: 30000, establish_base: 60000, migrate_base: 90000, plant_seed: 60000, go_fish: 240000, shoot_arrow: 45000, surface_for_air: 8000, escape_lava: 6000, clear_head: 6000, gather_leather: 60000, gather_lapis: 90000, enchant_item: 45000, breed_animals: 45000, summon_golem: 120000, leave_nether: 45000, deposit_base: 75000, restock_base: 75000, build_redstone: 90000, return_surface: 60000, wait: 10000,
    [Actions.SHELTER]: 60000, mine_from_shelter: 60000, descend_shaft_at_night: 90000,
    wake: 10000, sleep: 30000, prepare_bed: 45000, leave_shelter: 20000, mine_iron: 45000, cook_food: 120000, pick_glow_berries: 60000, hunt_fish: 30000, gather_mushroom_stew: 60000,
    [Actions.EXPLORE]: 60000
})
const MELEE = new Set(['zombie', 'husk', 'drowned', 'zombie_villager', 'spider', 'cave_spider', 'vindicator', 'piglin_brute', 'zombified_piglin'])
const INTERACTIVE = /(^|_)(furnace|smoker|chest|barrel|crafting_table|enchanting_table|anvil|bed|door|trapdoor|fence_gate|button|lever|shulker_box)$/
const STATIONARY_ACTIONS = new Set([
    'avoid_enderman',
    Actions.DESCEND,
    Actions.ASCEND,
    'wake', 'sleep', 'prepare_bed', 'leave_shelter', 'shoot_arrow', 'cook_food',
    Actions.CRAFT_TABLE, Actions.CRAFT_WOODEN_PICKAXE, Actions.CRAFT_STONE_PICKAXE,
    Actions.CRAFT_FURNACE, Actions.SMELT_IRON, Actions.CRAFT_IRON_PICKAXE, Actions.CRAFT_STONE_AXE, Actions.CRAFT_STONE_SHOVEL,
    'clear_inventory', 'loot_chest', 'smelt_charcoal', 'craft_progression', 'enchant_item', 'equip_armor', 'equip_shield', 'enter_nether', 'build_redstone', 'wait', Actions.SHELTER
])

const OPPORTUNISTIC = new Set(['mine_iron', 'pick_glow_berries', 'hunt_fish', 'gather_mushroom_stew'])
// Long resource walks that yield when a priority target appears; the user saw the bot walk past
// iron and glow berries mid-action, and the next decision would have taken them (17:23Z).
const INTERRUPTIBLE = new Set([Actions.WOOD, Actions.STONE, Actions.COAL, Actions.IRON, Actions.FOOD, Actions.SMELT_IRON,
    Actions.EXPLORE, 'gather_diamonds', 'gather_redstone', 'gather_lapis', 'return_surface'])

// Home anchors surfaceY. A login underground (after a memory reset, 17:11Z at Y=-19) gives a
// provisional sea-level home that the first open-sky position above Y=50 replaces.
function updateHome (memory, position, skyLight) {
    const p = position.floored()
    const open = skyLight >= 12 && p.y >= 50
    const home = memory.home
    if (home && ((!home.provisional && home.y >= 50) || (home.provisional && !open))) {
        return false
    }
    memory.home = open ? { x: p.x, y: p.y, z: p.z } : { ...(home || { x: p.x, z: p.z }), y: Math.max(home?.y ?? p.y, 63), provisional: true }
    return true
}

function shouldRelocateAfterStationFailure (action, failureCount, message) {
    return STATIONARY_ACTIONS.has(action) && failureCount % 3 === 0 &&
        /could not place (crafting table|furnace)/.test(message)
}

function mobilityRecoveryKind (shaftTrapped, elevationTrapped) {
    if (shaftTrapped) {
        return 'shaft'
    }
    if (elevationTrapped) {
        return 'elevation'
    }
    return null
}

function droppedItemGoal (entity) {
    const goal = new GoalFollow(entity, 1)
    const reached = goal.isEnd.bind(goal)
    goal.isEnd = node => entity.isValid === false || reached(node)
    return goal
}

// Steer away from melee inside 2.5 blocks using back/strafe controls relative to the facing set by
// lookAt, choosing the safest-footed direction most opposed to the threats; null releases controls.
function kite (c, threats) {
    const bot = c.bot
    const here = bot.entity.position
    const close = (threats || []).filter(e => here.distanceTo(e.position) < 2.5)
    let best = null
    if (close.length) {
        const away = close.reduce((v, e) => {
            const d = here.minus(e.position)
            const n = Math.max(Math.hypot(d.x, d.z), 0.1)
            return v.offset(d.x / (n * n), 0, d.z / (n * n))
        }, new Vec3(0, 0, 0))
        const yaw = bot.entity.yaw ?? 0
        const f = new Vec3(-Math.sin(yaw), 0, -Math.cos(yaw))
        const r = new Vec3(-f.z, 0, f.x)
        const feet = here.floored()
        // Forward options cover an attacker behind us (the first hit lands before we turn; user).
        for (const keys of [['back'], ['back', 'left'], ['back', 'right'], ['left'], ['right'], ['forward'], ['forward', 'left'], ['forward', 'right']]) {
            const dir = keys.reduce((v, k) => k === 'back' ? v.minus(f) : k === 'forward' ? v.plus(f) : k === 'left' ? v.minus(r) : v.plus(r), new Vec3(0, 0, 0))
            const unit = dir.scaled(1 / Math.hypot(dir.x, dir.z))
            const score = unit.x * away.x + unit.z * away.z
            const cell = here.plus(unit).floored()
            const level = !cell.equals(feet) && (safeFooting(bot, cell) || safeFooting(bot, cell.offset(0, -1, 0)))
            // Rising ground behind needs a jump; it is slower, so a level cell is preferred (user note).
            const rise = !level && !cell.equals(feet) && safeFooting(bot, cell.offset(0, 1, 0)) &&
                bot.blockAt(feet.offset(0, 2, 0), false)?.boundingBox === 'empty'
            const value = rise ? score * 0.8 : score
            if (value > 0 && (level || rise) && (!best || value > best.score)) {
                best = { keys: rise ? [...keys, 'jump'] : keys, score: value }
            }
        }
    }
    for (const key of ['back', 'forward', 'left', 'right', 'jump']) {
        bot.setControlState?.(key, Boolean(best?.keys.includes(key)))
    }
    return best?.keys ?? null
}

// One rule for the decision interrupt and fight(): armed, above 10 HP, only melee mobs within 16
// and at most four of them close (round 9: the crowd interrupt cancelled a kiting fight ten times).
function kiteableCrowd (c) {
    const here = c.bot.entity.position
    const near = Object.values(c.bot.entities || {}).filter(e => e.isValid && HOSTILES.has(e.name) &&
        here.distanceTo(e.position) <= 16)
    return c.bot.health > 10 && Boolean(c.bestItem?.([...WEAPONS])) && near.every(e => MELEE.has(e.name)) &&
        near.filter(e => here.distanceTo(e.position) <= 6).length <= 4
}

function pathfinderDropLimitForLanding (surfaceDrop) {
    return Math.min(4, surfaceDrop + 1)
}

function heapPressureExceeded (heapUsed, limit = HEAP_GUARD_BYTES) {
    return heapUsed >= limit
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitUntil (predicate, timeoutMs, intervalMs = 250) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const value = predicate()
        if (value) {
            return value
        }
        await sleep(intervalMs)
    }
    throw new Error(`timed out after ${timeoutMs}ms`)
}

function actionMadeProgress (action, before, after, moved) {
    if (INTERRUPTIBLE.has(action) && ['diamondInView', 'ironInView', 'foodOpportunity'].some(key => after[key] && !before[key])) {
        return true
    }
    if ([Actions.STONE, Actions.COAL, Actions.IRON].includes(action) &&
        ((before.hasIronPickaxe && !after.hasIronPickaxe) || (before.hasStonePickaxe && !after.hasStonePickaxe))) {
        return true
    }
    // Mining actions also collect opportunity ores; 03.01.22 flagged three coal pickups as stalls.
    const ore = ['coal', 'rawIron', 'diamonds', 'redstone'].some(field => after[field] > before[field])
    const progressed = {
        [Actions.WOOD]: after.logs > before.logs || after.planks > before.planks,
        [Actions.STONE]: after.cobblestone > before.cobblestone,
        [Actions.COAL]: ore,
        [Actions.IRON]: ore,
        [Actions.FOOD]: after.foodUnits > before.foodUnits,
        [Actions.DESCEND]: moved,
        [Actions.ASCEND]: moved,
        [Actions.RECOVER]: !after.recoveryAvailable,
        [Actions.EXPLORE]: moved
    }
    return !Object.hasOwn(progressed, action) || progressed[action] || moved
}


// A running job is ready once its time has passed, or at once if the bot has strayed far
// enough that the furnace might be left behind.
function smeltJobState (c) {
    let job = c.memory.smeltJob
    // A job's pull scales with its iron: death #5 (03.50.23) walked a bare respawn ~250 blocks
    // through a skeleton cave toward a 3-iron furnace.
    if (job && job.dimension === c.bot.game?.dimension &&
        c.bot.entity.position.distanceTo(new Vec3(job.x, job.y, job.z)) > 48 + 4 * (job.count || 0)) {
        c.log?.warn?.(`Abandoning the distant smelt job at ${job.x},${job.y},${job.z} (${job.count} raw iron).`)
        c.memory.smeltJob = job = null
    }
    if (!job || job.dimension !== c.bot.game.dimension) {
        return { smeltRunning: false, smeltReady: false }
    }
    if (job.needsFuel) {
        return { smeltRunning: false, smeltReady: c.hasAnyItem(['coal', 'charcoal']), smeltNeedsFuel: true }
    }
    const far = c.bot.entity.position.distanceTo(new Vec3(job.x, job.y, job.z)) > 48
    const ready = Date.now() >= job.readyAt || far
    return { smeltRunning: !ready, smeltReady: ready }
}

class SurvivalController {
    constructor (bot, options = {}) {
        this.bot = bot
        this.hostileNames = HOSTILES
        this.owner = options.owner || ''
        this.rng = createRng(options.seed ?? 1)
        this.probeSpacing = options.probeSpacing ?? 5
        this.onState = options.onState || (() => {})
        this.log = options.log || console
        this.memory = options.memory || {}
        // Process-wide throughput record shared across reconnects: earned ids with UTC times, deaths.
        this.runStats = options.runStats || { earned: [], deaths: [] }
        if (!(this.memory.blockedTargets instanceof Map)) {
            this.memory.blockedTargets = new Map()
        }
        if (!(this.memory.scoutVisits instanceof Map)) {
            this.memory.scoutVisits = new Map()
        }
        this.advancements = new AdvancementTracker((id, initial) => {
            this.log.info(`${initial ? 'Already completed' : 'Advancement earned'}: ${id}`)
            if (!initial) {
                this.runStats.earned.push({ id, at: new Date().toISOString() })
            }
            if (!initial && this.running) {
                this.bot.chat(`Advancement earned: ${id.split('/').at(-1)}`)
            }
        })
        this.bot._client.on('advancements', packet => this.advancements.update(packet))
        this.actionAbort = null
        this.followPlayer = this.memory.followPlayer || null
        if (!(this.memory.ownedStations instanceof Set)) {
            this.memory.ownedStations = new Set()
        }
        this.running = false
        this.paused = Boolean(this.memory.paused)
        this.busy = false
        this.sheltered = false
        this.shelterCenter = null
        this.activeAction = null
        this.home = null
        this.lastAction = 'starting'
        this.failures = new Map()
        this.loopTimer = null
        this.mcData = null
        this.scoutAngle = this.rng() * Math.PI * 2
        this.scoutSteps = 0
        this.loggedGoalId = null
        this.movements = null
        this.activeCollection = null
        this.memoryGuardTimer = null
        this.memoryGuardActive = false

        bot.loadPlugin(pathfinder)
        bot.loadPlugin(collectBlockPlugin)
        this.bindEvents()
    }

    bindEvents () {
        this.bot.once('spawn', () => {
            this.onSpawn().catch(error => {
                this.log.error(`Spawn initialization failed: ${error.stack || error.message}`)
                this.running = true
                if (!this.loopTimer) {
                    this.scheduleLoop(1000)
                }
            })
        })
        this.bot.on('death', () => {
            this.lastHitBearing = null
            const endermanDeath = Boolean(this.endermanThreat && this.endermanThreat.dimension === this.bot.game?.dimension)
            this.endermanThreat = null
            const position = this.bot.entity && this.bot.entity.position
            if (position) {
                const previous = this.memory.lastDeath
                const sameRecovery = previous && previous.dimension === this.bot.game.dimension &&
                    Date.now() - previous.diedAt < RECOVERY_WINDOW_MS &&
                    Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z) <= 16
                const near = Object.values(this.bot.entities || {}).filter(e => e.isValid && HOSTILES.has(e.name))
                    .map(e => ({ name: e.name, distance: position.distanceTo(e.position) }))
                // A fresh respawn cannot win where a crowd or an archer just killed a geared bot.
                // Lava also burns the drops, so a lava death site is never worth the trip back.
                const dangerous = near.filter(e => e.distance <= 12).length >= 2 || near.some(e => ARCHERS.has(e.name) && e.distance <= 16) ||
                    Boolean(this.inLava?.()) || endermanDeath
                this.memory.lastDeath = {
                    x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z),
                    diedAt: sameRecovery ? previous.diedAt : Date.now(),
                    attempts: sameRecovery ? previous.attempts : 0, dimension: this.bot.game.dimension,
                    dangerous: dangerous || Boolean(sameRecovery && previous.dangerous)
                }
                this.log.warn(`Remembered death position ${this.memory.lastDeath.x},${this.memory.lastDeath.y},${this.memory.lastDeath.z}; ` +
                    (dangerous ? 'threats remain there, so the drops will not be recovered.' : 'dropped items will be prioritized after respawn.'))
            }
            this.runStats?.deaths.push({ at: new Date().toISOString(), position: this.memory.lastDeath })
            this.log.warn('Bot died; it will resume after respawning.')
            this.sheltered = false
            this.shelterCenter = null
            this.lastDepartureSurface = null
            this.crowdRetreat = null
            this.memory.combatRefuge = null
            this.cancelCurrentTask('death')
        })
        this.bot.on('entityHurt', (victim, source) => {
            const action = this.activeAction || this.lastAction
            if (victim === this.bot.entity && source?.isValid && source.name === 'enderman') {
                this.endermanThreat = { id: source.id, dimension: this.bot.game.dimension, at: Date.now(), hit: true }
                this.lastHitBearing = null
                if (this.running && !this.paused && this.bot.health > 0 &&
                    !['avoid_enderman', 'escape_lava', 'surface_for_air', 'clear_head'].includes(action)) {
                    this.urgentReplan = true
                    if (this.busy) {
                        this.cancelCurrentTask('enderman attack; taking refuge')
                    } else {
                        this.scheduleLoop(0)
                    }
                }
                return
            }
            // damage_event names the shooter; an unseen skeleton 8 blocks behind shot the bot from 20 HP
            // to death while it kept mining (live 01:57Z), so archers count to 24 blocks.
            if (!this.running || this.paused || this.followPlayer || !victim || victim !== this.bot.entity ||
                this.bot.health <= 0 || !source?.isValid || !HOSTILES.has(source.name) ||
                victim.position.distanceTo(source.position) > (ARCHERS.has(source.name) ? 24 : 4) ||
                (this.busy && [Actions.FIGHT, Actions.ESCAPE, Actions.REFUGE, 'escape_lava', 'surface_for_air', 'clear_head'].includes(action))) {
                return
            }
            this.lastHitBearing = {
                point: source.position.offset(0, 0.75 * (source.height ?? 1.6), 0),
                dimension: this.bot.game.dimension,
                at: Date.now()
            }
            if (!this.busy) {
                this.scheduleLoop(0)
            } else if (!this.actionAbort?.signal.aborted) {
                const weapon = source.heldItem?.name
                this.cancelCurrentTask(`attacked by ${source.name}${weapon ? ` holding ${weapon}` : ''}`)
            }
        })
        let previousHealth = this.bot.health
        this.bot.on('health', () => {
            const action = this.activeAction || this.lastAction
            const tookDamage = Number.isFinite(previousHealth) && previousHealth - this.bot.health > 0.01
            if (this.running && tookDamage) {
                const threats = Object.values(this.bot.entities || {}).filter(entity => entity.isValid &&
                    (HOSTILES.has(entity.name) || (entity.name === 'enderman' && this.endermanThreat?.id === entity.id)) &&
                    this.bot.entity.position.distanceTo(entity.position) <= 12)
                    .map(entity => `${entity.name}:${this.bot.entity.position.distanceTo(entity.position).toFixed(1)}`)
                this.log.warn(`Damage: hp=${previousHealth.toFixed(2)}->${this.bot.health.toFixed(2)}, action=${action}, ` +
                    `sheltered=${this.sheltered}, nearby threats=${threats.join(',') || 'none'}, at ${this.positionText()}.`)
                if (action === 'avoid_enderman') {
                    if (this.inLava?.() && this.busy && !this.actionAbort?.signal.aborted) {
                        this.urgentReplan = true
                        this.cancelCurrentTask('burning in lava')
                    }
                    previousHealth = this.bot.health
                    return
                }
                if (this.memory && this.bot.game?.dimension === 'overworld' && this.isNight?.() &&
                    this.bot.entity.position.y >= (this.home?.y || 64) - 3 &&
                    (previousHealth - this.bot.health >= 4 || this.bot.health <= 16)) {
                    retreatForNight(this, 'surface damage or reduced health')
                    // Restarting a melee fight on every hit let two zombies win (staged 02:11Z); the next
                    // decision still weighs fight against escape.
                    if (this.busy && ![Actions.ESCAPE, Actions.SHELTER, Actions.FIGHT, Actions.REFUGE].includes(action)) {
                        this.cancelCurrentTask('night damage retreat')
                    }
                }
                const fleeingArmored = action === Actions.ESCAPE && this.bot.health > 6 && wornArmorPoints(this.bot) >= 12 &&
                    !this.nearestEntity?.(CREEPERS, 7) && this.nearestEntity?.(HOSTILES, 4)
                if (fleeingArmored && this.busy && !this.actionAbort?.signal.aborted) {
                    // Zombies keep pace with a fleeing bot; an armored one turns and fights instead (F032).
                    this.cancelCurrentTask(`attacked while fleeing by ${fleeingArmored.name}`)
                }
                if (this.inLava?.() && this.busy && action !== 'escape_lava' && !this.actionAbort?.signal.aborted) {
                    this.urgentReplan = true
                    this.cancelCurrentTask('burning in lava')
                }
                if (this.escapePinned?.() && this.busy && !this.actionAbort?.signal.aborted) {
                    this.corneredUntil = Date.now() + 6000
                    this.cancelCurrentTask('cornered while fleeing')
                }
                const attacker = this.nearestEntity?.(HOSTILES, 4) ||
                    Object.values(this.bot.entities || {}).find(e => e.isValid && ARCHERS.has(e.name) &&
                        this.bot.entity.position.distanceTo(e.position) <= 16 && this.canSee?.(e))
                if (attacker && this.busy && ![Actions.ESCAPE, Actions.FIGHT, Actions.REFUGE].includes(action) && !this.actionAbort?.signal.aborted) {
                    // Work must not continue under melee attack; the next decision fights or escapes.
                    this.cancelCurrentTask(`attacked by ${attacker.name}`)
                }
                if (this.sheltered) {
                    this.sheltered = false
                    this.shelterCenter = null
                    if (this.busy && action !== Actions.ESCAPE) {
                        this.cancelCurrentTask('damage while sheltered')
                    }
                }
            }
            previousHealth = this.bot.health
            if (this.bot.health <= 6 && this.busy && ![Actions.ESCAPE, Actions.REFUGE, 'avoid_enderman', 'escape_lava', 'surface_for_air', 'clear_head'].includes(action) &&
                (tookDamage || ![Actions.EAT, Actions.SHELTER].includes(action)) && !this.actionAbort?.signal.aborted) {
                this.cancelCurrentTask('critical health')
            }
        })
        this.bot.on('entityMoved', entity => {
            if (this.running && !this.paused && this.bot.health > 0 && this.bot.entity && HOSTILES.has(entity.name) &&
                ![Actions.REFUGE, 'avoid_enderman', 'escape_lava', 'surface_for_air', 'clear_head'].includes(this.activeAction) &&
                updateCrowdRetreat(this, HOSTILES) && !(this.activeAction === Actions.FIGHT && kiteableCrowd(this))) {
                if (this.busy && !this.actionAbort?.signal.aborted) {
                    this.cancelCurrentTask('crowd of mobs; taking wall refuge')
                } else if (!this.busy) {
                    this.scheduleLoop(0)
                }
            }
            if (entity.name !== 'creeper' || !this.running || !this.busy || [Actions.ESCAPE, Actions.REFUGE].includes(this.activeAction) ||
                this.actionAbort?.signal.aborted || !this.bot.entity ||
                this.bot.entity.position.distanceTo(entity.position) > 6 || !this.canSee(entity)) {
                return
            }
            this.log.warn(`Creeper visible at ${this.bot.entity.position.distanceTo(entity.position).toFixed(1)} blocks; interrupting ${this.activeAction}.`)
            this.cancelCurrentTask('creeper approaching')
        })
        const endermanAlert = entity => {
            if (entity.name !== 'enderman' || !this.running || this.paused || this.bot.health <= 0 ||
                !this.endermanDanger() || ['avoid_enderman', 'escape_lava', 'surface_for_air', 'clear_head'].includes(this.activeAction) ||
                this.actionAbort?.signal.aborted) {
                return
            }
            this.urgentReplan = true
            if (this.busy) {
                this.cancelCurrentTask('angry enderman; taking refuge')
            } else {
                this.scheduleLoop(0)
            }
        }
        this.bot.on('entityUpdate', endermanAlert)
        this.bot.on('entityMoved', endermanAlert)
        this.bot.on('time', () => {
            if (this.running && this.busy && this.activeAction === 'fill_water_bucket' && this.waterDaytimeSearch &&
                this.isNight() && !this.actionAbort?.signal.aborted) {
                this.urgentReplan = true
                this.cancelCurrentTask('nightfall during surface water search')
            }
        })
        this.bot.on('breath', () => {
            if (!this.running || this.paused || this.bot.health <= 0 || !(this.bot.oxygenLevel <= 12) ||
                ['surface_for_air', 'escape_lava', 'clear_head'].includes(this.activeAction) || this.actionAbort?.signal.aborted) {
                return
            }
            if (this.busy) {
                this.cancelCurrentTask('low air supply')
            } else {
                this.scheduleLoop(0)
            }
        })
        this.bot.on('chat', (username, message) => this.onChat(username, message))
    }

    configureDigging () {
        // The pinned registry uses a harvest restriction in place of the tool speed tag.
        const obsidian = this.bot.registry.blocksByName.obsidian
        if (obsidian?.material === 'incorrect_for_wooden_tool') {
            obsidian.material = 'mineable/pickaxe'
        }
        const dig = this.bot.dig.bind(this.bot)
        this.bot.dig = async (block, ...args) => {
            const tool = this.bot.heldItem
            if (block?.material === 'mineable/pickaxe' && (!tool?.name.endsWith('_pickaxe') || !block.canHarvest(tool.type))) {
                throw new Error(`digging ${block.name} requires a pickaxe`)
            }
            if (block?.material === 'mineable/shovel') {
                this.log.debug?.(`Breaking ${block.name} with ${tool?.name || 'bare hands'}.`)
            }
            const dimension = this.bot.game.dimension
            await dig(block, ...args)
            if (block && this.bot.game.dimension === dimension) {
                rememberMiningExposure(this, block)
            }
        }
    }

    async onSpawn () {
        this.configureDigging()
        this.configureLooking()
        this.log.info(`Spawned as ${this.bot.username} on Minecraft ${this.bot.version} at ${this.positionText()}; waiting for terrain...`)
        try {
            await this.bot.waitForChunksToLoad()
        } catch (error) {
            this.log.warn(`Full spawn-area load did not finish: ${error.message}`)
        }
        await waitUntil(() => this.bot.blockAt(this.bot.entity.position.floored().offset(0, -1, 0)), 5000, 100)
            .catch(error => this.log.warn(`Spawn support block is still unavailable: ${error.message}`))

        this.mcData = require('minecraft-data')(this.bot.version)
        const movements = new Movements(this.bot)
        this.movements = movements
        this.configureSafeMovements(movements)
        if (this.bot.collectBlock && this.bot.collectBlock.movements) {
            this.configureSafeMovements(this.bot.collectBlock.movements)
        }
        this.bot.pathfinder.thinkTimeout = 5000
        this.bot.pathfinder.searchRadius = PATH_SEARCH_RADIUS
        for (const name of ['lava', 'fire', 'soul_fire', 'cactus', 'sweet_berry_bush']) {
            const block = this.mcData.blocksByName[name]
            if (!block) {
                continue
            }
            movements.blocksToAvoid.add(block.id)
            if (this.bot.collectBlock && this.bot.collectBlock.movements) {
                this.bot.collectBlock.movements.blocksToAvoid.add(block.id)
            }
        }
        this.bot.pathfinder.setMovements(movements)
        this.bot.collectBlock.movements = null
        updateHome(this.memory, this.bot.entity.position, this.bot.blockAt(this.bot.entity.position.offset(0, 1, 0))?.skyLight)
        this.home = new Vec3(this.memory.home.x, this.memory.home.y, this.memory.home.z)
        const savedShelter = this.memory.shelter
        if (savedShelter?.dimension === this.bot.game.dimension) {
            const center = new Vec3(savedShelter.x, savedShelter.y, savedShelter.z)
            if (this.hasEnclosedShelter(center)) {
                this.shelterCenter = center
                this.sheltered = true
            }
        }
        const support = this.bot.blockAt(this.bot.entity.position.floored().offset(0, -1, 0))
        const trap = this.detectElevationTrap()
        const landing = this.findSafeLowerLanding()
        this.log.info(`Spawn mobility check: support=${support ? support.name : 'unknown'}, ` +
            `isolatedPillar=${Boolean(trap)}, lowerLanding=${landing ? `${landing.x},${landing.y},${landing.z} drop=${landing.drop}` : 'none'}.`)
        if (!this.sheltered && (trap || (landing && landing.drop >= 3 && landing.distance <= 2.5))) {
            this.log.info('Raised spawn platform detected; resolving it before starting survival goals.')
            await this.recoverMobility().catch(error => this.log.warn(`Initial mobility recovery failed: ${error.message}`))
        }
        this.running = true
        this.startMemoryGuard()
        if (!this.loopTimer) {
            this.scheduleLoop(1000)
        }
    }

    startMemoryGuard () {
        clearInterval(this.memoryGuardTimer)
        this.memoryGuardTimer = setInterval(() => {
            const heapUsed = process.memoryUsage().heapUsed
            if (!heapPressureExceeded(heapUsed) || this.memoryGuardActive) {
                return
            }
            this.memoryGuardActive = true
            const heapMb = Math.round(heapUsed / 1024 / 1024)
            this.log.warn(`Heap pressure reached ${heapMb}MB; cancelling the current path before it exhausts Node memory.`)
            this.cancelCurrentTask(`heap memory guard at ${heapMb}MB`)
            const reset = setTimeout(() => { this.memoryGuardActive = false }, 10000)
            reset.unref()
        }, 1000)
        this.memoryGuardTimer.unref()
    }

    scheduleLoop (delay = 1500) {
        clearTimeout(this.loopTimer)
        this.loopTimer = setTimeout(() => this.tick(), delay)
    }

    async tick () {
        if (!this.running) {
            return
        }
        if (this.paused || !this.bot.entity || this.bot.health <= 0 || this.busy) {
            this.scheduleLoop()
            return
        }

        if (this.followPlayer && !this.endermanDanger() && !updateCrowdRetreat(this, HOSTILES) && (this.bot.oxygenLevel ?? 20) > 12) {
            const entity = this.bot.players[this.followPlayer]?.entity
            if (entity && !this.bot.pathfinder.isMoving()) {
                this.bot.pathfinder.setGoal(new GoalFollow(entity, 2), true)
            }
            this.scheduleLoop()
            return
        }
        this.busy = true
        this.actionAbort = new AbortController()
        let action = Actions.EXPLORE
        try {
            let state
            try {
                const hit = this.lastHitBearing
                this.lastHitBearing = null
                if (hit && hit.dimension === this.bot.game.dimension && Date.now() - hit.at <= 1500) {
                    await this.bot.lookAt(hit.point, true)
                }
                state = this.observe()
                action = chooseAction(state)
            } catch (error) {
                // A perception or policy fault must not disable self-defence (F023).
                const hostile = this.nearestEntity(HOSTILES, 8)
                this.log.warn(`Decision failed: ${error.message}; ${hostile ? `escaping ${hostile.name}` : 'waiting'} instead.`)
                action = hostile ? Actions.ESCAPE : 'wait'
                await this.performWithTimeout(action, { hostile, creeperDistance: Infinity })
                return
            }
            const advancement = nextAdvancement(state)
            this.lastAction = action
            if (advancement.id !== this.loggedGoalId) {
                this.loggedGoalId = advancement.id
                this.log.info(`Advancement target: ${advancement.title} (${advancement.reason})`)
            }
            this.log.info(`Action: ${action} | hp=${state.health.toFixed(1)} food=${state.food} | ${this.inventorySummary()} | at ${this.positionText()} | ` +
                `mealPoints=${state.mealReserve?.toFixed(1)} timeOfDay=${this.bot.time?.timeOfDay} underground=${state.underground}`)
            this.onState(state, action)
            const actionStart = this.bot.entity.position.clone()
            // Remember where an escape began; one that cannot leave that spot is cornered (03.36.15).
            if (action !== Actions.ESCAPE) {
                this.escapeOrigin = null
            } else if (!this.escapeOrigin || actionStart.distanceTo(this.escapeOrigin.position) >= 1.2) {
                this.escapeOrigin = { position: actionStart, at: Date.now() }
            }
            await this.performWithTimeout(action, state)
            const after = this.observe()
            this.onState(after, action)
            this.verifyActionProgress(action, state, after, actionStart)
            const next = nextAdvancement(after)
            const detour = this.memory.diamondDetour
            if (detour && !after.diamondInView && (next.id !== detour.id || next.item !== detour.item)) {
                this.memory.diamondDetour = null
            }
            if (next.id !== advancement.id) {
                this.log.info(`Next objective: ${next.title}. Completion is confirmed separately by the server.`)
            }
            this.failures.set(action, 0)
            this.lastActionFailed = false
        } catch (error) {
            this.lastActionFailed = true
            const count = (this.failures.get(action) || 0) + 1
            this.failures.set(action, count)
            const message = error && error.message ? error.message : String(error)
            const foodStalled = action === Actions.FOOD && this.actionAbort?.signal.reason === `${action} is stuck`
            // Approach timeouts and failed scouts at one spot (live 00.35.19 stair top) never say "no path".
            if (count === 1 || !this.failureOrigin) {
                this.failureOrigin = this.bot.entity.position.clone()
            }
            // A surfacing bot must not take the six-block drops of unstick scouting (00.54.52 fell to Y=46).
            const stalledInPlace = count >= 3 && action !== 'return_surface' &&
                this.bot.entity.position.distanceTo(this.failureOrigin) < 1.5
            this.log.warn(`${action} failed (${count}): ${message}`)
            // A failed collect/path can leave a direct Mineflayer dig in flight even
            // though its promise already rejected. Stop all action ownership before
            // starting a staircase, descent, or relocation that uses the same bot.
            this.clearCurrentTask()
            await sleep(100)
            if (this.urgentReplan || [Actions.REFUGE, 'mine_from_refuge', 'avoid_enderman', 'fill_water_bucket'].includes(action) ||
                !this.running || this.paused || this.followPlayer || this.bot.health <= 0) {
                return
            }
            this.actionAbort = new AbortController()
            const recoveryKind = mobilityRecoveryKind(
                this.detectVerticalShaft(),
                Boolean(this.detectElevationTrap())
            )
            if (recoveryKind === 'shaft' && action !== Actions.ASCEND) {
                this.log.info('The failed action left the bot in a vertical shaft; attempting a bounded staircase escape.')
                await this.performWithTimeout(Actions.ASCEND, this.observe())
                    .catch(recoveryError => this.log.warn(`Shaft recovery failed: ${recoveryError.message}`))
            } else if (recoveryKind === 'elevation') {
                this.log.info('The failed action left the bot on an isolated pillar; attempting a bounded descent.')
                await this.performWithTimeout(Actions.DESCEND, this.observe())
                    .catch(recoveryError => this.log.warn(`Pillar recovery failed: ${recoveryError.message}`))
            }
            if (!this.running || this.paused || this.followPlayer || this.bot.health <= 0) {
                return
            }
            if (shouldRelocateAfterStationFailure(action, count, message)) {
                this.log.warn(`Workstation placement failed ${count} times; relocating to a different patch of land.`)
                try {
                    await this.scout(10)
                    this.failures.set(action, 0)
                } catch (relocationError) {
                    this.log.warn(`Workspace relocation failed: ${relocationError.message}`)
                }
            }
            // Unstick scouting accepts six-block drops, which only take a surfacing bot deeper (04.01.02).
            // Opportunistic targets are blocked one by one; a run of unreachable ores is not a stuck bot (17:14:26Z).
            const opportunistic = OPPORTUNISTIC.has(action)
            // Unstick carves a rising staircase; under attack that only climbed into the mobs (staged round 5).
            const threatNear = Object.values(this.bot.entities || {}).some(e => e.isValid && HOSTILES.has(e.name) &&
                e.position.distanceTo(this.bot.entity.position) <= 8)
            if (threatNear) {
                return
            }
            if (count >= 3 && action !== 'return_surface' && !opportunistic && (foodStalled || stalledInPlace || /no path to the goal/i.test(message))) {
                await this.unstick().catch(unstickError => this.log.warn(`Unstick failed: ${unstickError.message}`))
            } else if (count >= 3 && !STATIONARY_ACTIONS.has(action) && !opportunistic) {
                await this.scout(12).catch(() => {})
            }
        } finally {
            this.busy = false
            if (this.running) {
                // A lit creeper explodes 1.5 s after swelling, so threats replan at once; a fixed 1.5 s
                // after every success idled ~5% of run time, so only failures keep that back-off.
                this.scheduleLoop(this.urgentReplan ? 100 : this.lastActionFailed ? 1500 : 250)
            }
            this.urgentReplan = false
        }
    }

    observe () {
        if ((this.memory.home?.provisional || this.memory.home?.y < 50) &&
            updateHome(this.memory, this.bot.entity.position, this.bot.blockAt(this.bot.entity.position.offset(0, 1, 0))?.skyLight)) {
            this.home = new Vec3(this.memory.home.x, this.memory.home.y, this.memory.home.z)
            this.log.info(`Home surface set at ${this.home} on reaching open sky.`)
        }
        if (!this.isNight() && !this.shelterCenter) {
            this.sheltered = false
        }
        if (this.sheltered && !this.bot.isSleeping &&
            (!this.shelterCenter || !this.hasEnclosedShelter(this.shelterCenter))) {
            this.sheltered = false
            this.shelterCenter = null
            this.log.warn('Shelter enclosure is no longer intact; replanning protection.')
        }
        const hostile = this.bot.nearestEntity(entity => entity.isValid && HOSTILES.has(entity.name) &&
            this.bot.entity.position.distanceTo(entity.position) <= 24 && this.canSee(entity))
        const creeper = this.nearestEntity(CREEPERS, 8)
        const creeperVisible = Boolean(creeper && this.canSee(creeper))
        const archer = this.nearestEntity(ARCHERS, 16)
        const archerVisible = Boolean(archer && this.canSee(archer))
        const lastDeath = this.memory.lastDeath
        const recoveryAge = lastDeath ? Date.now() - lastDeath.diedAt : Infinity
        const hasTableNow = this.hasItem('crafting_table') || Boolean(this.findStation('crafting_table', 4))
        const hasStonePickNow = this.hasAnyItem(['stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'])
        const hasIronPickNow = this.hasAnyItem(['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'])
        const hasWoodPickNow = this.hasItem('wooden_pickaxe') || hasStonePickNow
        const hasFurnaceNow = this.hasItem('furnace') || Boolean(this.findStation('furnace', 4))
        const ironIngots = this.countItems(['iron_ingot'])
        const inventory = this.bot.inventory.items()
        const items = {}
        for (const item of inventory) {
            items[item.name] = (items[item.name] || 0) + item.count
        }
        const freeInventorySlots = this.bot.inventory.emptySlotCount()
        const torso = this.bot.inventory.slots[6]
        const offhand = this.bot.inventory.slots[45]
        const armorNames = ['iron_chestplate', 'diamond_chestplate', 'netherite_chestplate']
        const armorEquipped = Boolean(torso && armorNames.includes(torso.name))
        const shieldEquipped = offhand?.name === 'shield'
        const shaft = this.memory.shaft
        const feet = this.bot.entity.position.floored()
        const shaftEntrance = shaft?.cells?.[0]
        const nightShaftReady = Boolean(shaftEntrance) && shaft.dimension === this.bot.game.dimension && shaft.cells.length >= 8 &&
            !(shaft.retryAfter > Date.now()) && feet.distanceTo(new Vec3(shaftEntrance.x, shaftEntrance.y, shaftEntrance.z)) <= 12 &&
            shaft.cells.at(-1).y <= feet.y - 6
        const state = {
            endermanDanger: this.endermanDanger(),
            health: this.bot.health,
            food: this.bot.food,
            hostile,
            hostileDistance: hostile ? this.bot.entity.position.distanceTo(hostile.position) : Infinity,
            meleeDistance: (() => { const m = this.closeMelee(4); return m ? this.bot.entity.position.distanceTo(m.position) : Infinity })(),
            creeper: creeperVisible ? creeper : null,
            creeperDistance: creeperVisible ? this.bot.entity.position.distanceTo(creeper.position) : Infinity,
            ranged: archerVisible ? archer : null,
            rangedDistance: archerVisible ? this.bot.entity.position.distanceTo(archer.position) : Infinity,
            hasWeapon: Boolean(this.bestItem(['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', ...WOODCUTTING_AXES, 'golden_axe', 'wooden_axe'])),
            hasFood: Boolean(this.bestFood()),
            isNight: this.isNight(),
            sheltered: this.sheltered,
            canMineFromShelter: this.sheltered && !this.memory.shelter?.descentFailed,
            nightShaftReady,
            needsShelterExit: Boolean(this.shelterCenter && !this.isNight()),
            shaftTrapped: this.detectVerticalShaft(),
            elevationTrapped: Boolean(this.detectElevationTrap()),
            // Without a pickaxe a drop far above or below cannot be reached in time; rebuild instead.
            recoveryAvailable: Boolean(lastDeath && !lastDeath.dangerous && lastDeath.dimension === this.bot.game.dimension && recoveryAge < RECOVERY_WINDOW_MS && lastDeath.attempts < 3 &&
                (hasWoodPickNow || Math.abs(lastDeath.y - this.bot.entity.position.y) <= 12)),
            recoverySecondsLeft: lastDeath ? Math.max(0, Math.floor((RECOVERY_WINDOW_MS - recoveryAge) / 1000)) : 0,
            logs: this.countMatching(name => LOG_SUFFIXES.some(suffix => name.endsWith(suffix))),
            // Recipes need one plank type (see ensurePlanks), so mixed leftovers do not add up.
            planks: Math.max(0, ...[...new Set(Object.keys(items).filter(name => name.endsWith('_planks')))].map(name => this.countItems([name]))),
            sticks: this.countItems(['stick']),
            hasCraftingTable: hasTableNow,
            hasWoodenPickaxe: hasWoodPickNow,
            cobblestone: this.countItems(['cobblestone', 'cobbled_deepslate']),
            hasStonePickaxe: hasStonePickNow,
            hasWoodcuttingAxe: this.hasAnyItem(WOODCUTTING_AXES),
            hasDiggingShovel: this.hasAnyItem(DIGGING_SHOVELS),
            hasFurnace: hasFurnaceNow,
            foodUnits: this.foodUnits(),
            coal: this.countItems(['coal', 'charcoal']),
            pendingSmelt: Boolean(this.memory.pendingSmelt),
            ...smeltJobState(this),
            hasSmeltingFuel: this.countItems(['coal', 'charcoal']) > 0,
            rawIron: this.countItems(['raw_iron']),
            ironIngots,
            hasIronPickaxe: hasIronPickNow,
            hasDiamondPickaxe: this.hasAnyItem(['diamond_pickaxe', 'netherite_pickaxe']),
            hasIronArmor: armorEquipped || this.hasAnyItem(armorNames), armorEquipped,
            hasShield: shieldEquipped || this.hasItem('shield'), shieldEquipped,
            hasBucket: this.hasAnyItem(['bucket', 'lava_bucket']),
            buckets: this.countItems(['bucket', 'water_bucket', 'lava_bucket']),
            hasEmptyBucket: this.hasItem('bucket'), waterBuckets: this.countItems(['water_bucket']), hasLavaBucket: this.hasItem('lava_bucket'),
            obsidianCastPending: this.memory.obsidianCast?.dimension === this.bot.game.dimension,
            hasFlintAndSteel: this.hasItem('flint_and_steel'),
            diamonds: this.countItems(['diamond']), obsidian: this.countItems(['obsidian']),
            diamondDetour: this.memory.diamondDetour,
            redstone: this.countItems(['redstone']), flint: this.countItems(['flint']),
            completedAdvancements: this.advancements.completed,
            dimension: this.bot.game.dimension, items,
            freeInventorySlots,
            inventoryFull: (freeInventorySlots === 0 || (freeInventorySlots <= 4 && Boolean(discardableStack(inventory)))) &&
                !(this.memory.disposalBackoffUntil > Date.now()),
            surfaceY: this.home?.y || 64, y: this.bot.entity.position.y,
            underground: Boolean(this.sheltered && this.memory.shelter?.burrowed) ||
                (this.bot.entity.position.y < (this.home?.y || 64) - 3 && !(this.bot.blockAt(this.bot.entity.position.offset(0, 1, 0))?.skyLight >= 12) &&
                    coveredAbove(this.bot, this.bot.entity.position.floored().offset(0, 1, 0))),
            portalInProgress: Boolean(this.memory.portalOrigin),
            redstoneInProgress: Boolean(this.memory.redstoneOrigin),
            redstoneRequested: Boolean(this.memory.redstoneRequested)
        }
        if (state.dimension === 'overworld' && !state.underground && feet.y >= Math.min(state.surfaceY, 63) - 16) {
            this.lastDepartureSurface = feet
        }
        if (state.dimension === 'overworld' && this.lastDepartureSurface?.distanceTo(feet) <= 24) {
            state.departureSurfaceY = this.lastDepartureSurface.y
        }
        if (state.health <= 6) {
            this.recoveringHealth = true
        } else if (state.health >= 14) {
            this.recoveringHealth = false
        }
        state.recoveringHealth = Boolean(this.recoveringHealth)
        if (this.escapePinned?.()) {
            this.corneredUntil = Date.now() + 6000
        }
        state.cornered = this.corneredUntil > Date.now() && (state.hostileDistance <= 3 || Boolean(this.closeMelee()))
        state.inLava = this.inLava()
        state.suffocating = Boolean(this.suffocatingBlock())
        state.oxygen = this.bot.oxygenLevel ?? 20
        const headBlock = this.bot.blockAt(this.bot.entity.position.offset(0, this.bot.entity.eyeHeight ?? 1.62, 0), false)
        state.headInWater = WATER_BLOCKS.has(headBlock?.name) || headBlock?.getProperties?.().waterlogged === true
        // Hostiles behind walls cannot reach a sealed pocket; only visible ones make a crowd.
        state.visibleHostiles = this.visibleThreatCount(12)
        state.closeHostiles = this.visibleThreatCount()
        state.crowdRetreat = updateCrowdRetreat(this, HOSTILES)
        if (this.memory.combatRefuge?.dimension !== this.bot.game.dimension) {
            this.memory.combatRefuge = null
        }
        state.combatRefuge = Boolean(this.memory.combatRefuge)
        state.gear = new Set([...this.bot.inventory.items(), ...[5, 6, 7, 8, 45].map(slot => this.bot.inventory.slots[slot])]
            .filter(Boolean).map(item => item.name))
        state.armorUpgrade = armorUpgrades(this.bot).length > 0
        state.ironCap = ironReserveCap(state)
        this.ironWanted = state.rawIron + state.ironIngots < state.ironCap
        try {
            state.diamondInView = Boolean(this.mcData && findPriorityDiamond(this))
            state.ironInView = Boolean(this.mcData && this.ironWanted && findPriorityOre(this, IRON_ORES))
        } catch (error) {
            state.diamondInView = state.ironInView = false
            this.log.warn(`Priority ore search failed; ignoring it this cycle: ${error.message}`)
        }
        if (this.mcData && state.health >= 16 && state.hostileDistance > 12 && freeInventorySlots > 1) {
            state.lootTarget = findNearbyLoot(this)
        }
        enchantingState(this, state)
        if (state.redstoneRequested && nextAdvancement(state).action === 'wait' && state.dimension === 'overworld') {
            state.sideGoal = redstonePlan(state)
        }
        return archeryState(this, golemState(this, breedingState(this, fishingState(this, farmingState(this, baseState(this, foodState(this, updateNightState(this, state))))))))
    }

    async perform (action, state) {
        switch (action) {
            case 'avoid_enderman': return this.avoidEnderman()
            case 'mine_diamond': {
                if (!this.memory.diamondDetour) {
                    const goal = nextAdvancement(state)
                    this.memory.diamondDetour = { id: goal.id, item: goal.item, diamonds: state.diamonds }
                }
                return performProgression(this, action, state)
            }
            case 'loot_chest': return lootChest(this, state.lootTarget)
            case 'cook_food': return cookFood(this)
            case 'pick_glow_berries': return pickGlowBerries(this)
            case 'hunt_fish': return huntFish(this, state.foodOpportunity?.target)
            case 'gather_mushroom_stew': return this.gatherMushroomStew(state)
            case 'plant_seed': return plantSeed(this)
            case 'go_fish': return goFish(this)
            case 'shoot_arrow': return shootArrow(this)
            case 'surface_for_air': return this.surfaceForAir()
            case 'escape_lava': return this.escapeLava()
            case 'clear_head': return this.clearHead()
            case 'gather_leather': return gatherLeather(this)
            case 'enchant_item': return enchantItem(this)
            case 'breed_animals': return breedAnimals(this)
            case 'summon_golem': return summonGolem(this)
            case 'establish_base': return establishBase(this)
            case 'migrate_base': return migrateBase(this)
            case 'deposit_base': return depositAtBase(this)
            case 'restock_base': return restockAtBase(this)
            case 'wake': return wakeWithOwner(this)
            case 'sleep': return sleepSafely(this, state)
            case 'prepare_bed': return prepareBed(this, state.bedWool)
            case 'leave_shelter': return leaveShelter(this)
            case 'mine_from_shelter': return this.mineFromShelter()
            case 'descend_shaft_at_night': {
                const shaft = this.memory.shaft
                if (!await followShaft(this, 'down') && shaft) {
                    shaft.retryAfter = Date.now() + 300000
                }
                return
            }
            case Actions.ESCAPE:
                if (state.creeperDistance <= 6) {
                    // A creeper's fuse winds back down once its target is more than seven blocks away.
                    return this.takeCover(state.creeper, 8)
                }
                if (state.rangedDistance <= 16) {
                    return this.takeCover(state.ranged, 24)
                }
                // No route away with melee at arm's length is being cornered: fight next, not retry.
                return this.escapeFrom(state.hostile).catch(error => {
                    if (/no path/i.test(error.message) && this.closeMelee()) {
                        this.corneredUntil = Date.now() + 6000
                    }
                    throw error
                })
            case Actions.REFUGE: return retreatToWall(this)
            case 'mine_from_refuge': return mineFromRefuge(this, state)
            case Actions.DESCEND: return this.descendSafely()
            case Actions.ASCEND: return this.escapeVerticalShaft()
            case Actions.RECOVER: return this.recoverItems()
            case Actions.FIGHT: return this.fight(state.rangedDistance <= 12 ? state.ranged : state.hostile ?? (state.cornered ? this.closeMelee() : null),
                false, null, state.cornered)
            case Actions.EAT: return this.eat()
            case Actions.SHELTER: return this.makeNightSafe()
            case Actions.WOOD: return this.gatherWood()
            case Actions.CRAFT_TABLE: return this.craftTable()
            case Actions.CRAFT_WOODEN_PICKAXE: return this.craftWoodenPickaxe()
            case Actions.STONE: return this.gatherStone()
            case Actions.CRAFT_STONE_PICKAXE: return this.craftStonePickaxe()
            case Actions.CRAFT_FURNACE: return this.craftFurnace()
            case Actions.FOOD: return this.gatherFood(state)
            case Actions.COAL: return this.gatherOre(['coal_ore', 'deepslate_coal_ore'], 32)
            case Actions.IRON: return this.gatherOre(['iron_ore', 'deepslate_iron_ore'], 32)
            case Actions.SMELT_IRON:
                return this.smeltIron(state.hasIronPickaxe ? 64 : Math.max(1, RECIPES.iron_pickaxe.ironIngots - state.ironIngots), ironPickPlankFuel(state))
            case Actions.CRAFT_IRON_PICKAXE: return this.craftIronPickaxe()
            case Actions.EXPLORE: return this.explore()
            default: return performProgression(this, action, state)
        }
    }

    verifyActionProgress (action, before, after, startPosition) {
        const moved = this.bot.entity.position.distanceTo(startPosition) >= 1
        if (!actionMadeProgress(action, before, after, moved)) {
            throw new Error(`${action} produced no verified inventory or movement progress`)
        }
    }

    async performWithTimeout (action, state) {
        const timeoutMs = ACTION_TIMEOUT_MS[action]
        if (!timeoutMs) {
            return this.perform(action, state)
        }

        const previousAction = this.activeAction
        this.activeAction = action
        let timeout
        let movementWatchdog
        let opportunityWatchdog
        let cancelledByGuard = false
        const signal = this.actionAbort.signal
        let abortListener
        const operation = Promise.resolve().then(() => this.perform(action, state))
        try {
            const attempts = [
                operation,
                new Promise((resolve, reject) => {
                    abortListener = () => {
                        cancelledByGuard = true
                        reject(new Error(`${action} cancelled`))
                    }
                    signal.addEventListener('abort', abortListener, { once: true })
                    if (signal.aborted) {
                        abortListener()
                    }
                }),
                new Promise((resolve, reject) => {
                    timeout = setTimeout(() => {
                        cancelledByGuard = true
                        this.cancelCurrentTask(`${action} timed out after ${Math.round(timeoutMs / 1000)}s`)
                        reject(new Error(`${action} timed out after ${Math.round(timeoutMs / 1000)}s`))
                    }, timeoutMs)
                    timeout.unref()
                })
            ]
            if (!STATIONARY_ACTIONS.has(action)) {
                attempts.push(new Promise((resolve, reject) => {
                    let lastPosition = this.bot.entity.position.clone()
                    let lastMovementAt = Date.now()
                    movementWatchdog = setInterval(() => {
                        if (!this.bot.entity) {
                            return
                        }
                        const current = this.bot.entity.position
                        if (current.distanceTo(lastPosition) >= 0.75) {
                            lastPosition = current.clone()
                            lastMovementAt = Date.now()
                            return
                        }
                        // Mining deliberately holds the bot in place. Treat an active dig
                        // as liveness so the movement watchdog does not abort useful work.
                        // A pillar refuge or a fight in place holds still on purpose (round 6 cancelled one).
                        if (this.bot.targetDigBlock || Date.now() - (this.combatLiveAt || 0) < 3000) {
                            lastMovementAt = Date.now()
                            return
                        }
                        if (Date.now() - lastMovementAt >= 12000) {
                            clearInterval(movementWatchdog)
                            cancelledByGuard = true
                            this.cancelCurrentTask(`${action} is stuck`)
                            reject(new Error(`${action} made no movement for 12s`))
                        }
                    }, 1000)
                    movementWatchdog.unref()
                }))
            }
            const stockingWood = action === Actions.WOOD && !state.isNight && !hasMiningWood(state)
            if (INTERRUPTIBLE.has(action) && !stockingWood) {
                const allowOre = action !== Actions.FOOD && !(action === 'return_surface' && state.mealReserve < MIN_MINING_MEALS)
                const initial = this.priorityTargetInView(allowOre)
                attempts.push(new Promise(resolve => {
                    opportunityWatchdog = setInterval(() => {
                        const seen = this.priorityTargetInView(allowOre)
                        if (seen && seen !== initial) {
                            clearInterval(opportunityWatchdog)
                            cancelledByGuard = true
                            resolve()
                            this.cancelCurrentTask(`${seen} came into view during ${action}`)
                        }
                    }, 1500)
                    opportunityWatchdog.unref?.()
                }))
            }
            return await Promise.race(attempts)
        } finally {
            clearTimeout(timeout)
            clearInterval(movementWatchdog)
            clearInterval(opportunityWatchdog)
            signal.removeEventListener('abort', abortListener)
            this.activeAction = previousAction
            if (cancelledByGuard) {
                // A cancelled action must release pathfinding before another action starts.
                const settled = await Promise.race([
                    operation.then(() => true, () => true),
                    sleep(2000).then(() => false)
                ])
                if (!settled) {
                    this.log.warn('Cancelled task retained control; reconnecting before another task can start.')
                    this.stop()
                    this.bot.quit('Resetting cancelled task')
                }
            }
        }
    }

    async gotoWithTimeout (goal, timeoutMs, label) {
        let timeout
        try {
            return await Promise.race([
                this.bot.pathfinder.goto(goal),
                new Promise((resolve, reject) => {
                    timeout = setTimeout(() => {
                        this.bot.pathfinder.setGoal(null)
                        reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`))
                    }, timeoutMs)
                    timeout.unref()
                })
            ])
        } finally {
            clearTimeout(timeout)
        }
    }

    async recoverItems () {
        const death = this.memory.lastDeath
        if (!death) {
            return
        }
        death.attempts += 1
        const secondsLeft = Math.max(0, Math.floor((RECOVERY_WINDOW_MS - (Date.now() - death.diedAt)) / 1000))
        this.log.info(`Recovering dropped items at ${death.x},${death.y},${death.z}; about ${secondsLeft}s remain before despawn.`)
        await this.bot.pathfinder.goto(new GoalNear(death.x, death.y, death.z, 4))
        await sleep(500)
        const drops = await scanFor(this, () => {
            const visible = this.visibleDrops(this.bot.entity.position, 16)
            return visible.length ? visible : null
        })
        if (drops) {
            await this.collectTarget(drops, null, 'death drops')
            await sleep(500)
        }
        this.log.info(`Death-site recovery complete; targeted ${drops?.length ?? 0} visible item stacks.`)
        this.memory.lastDeath = null
    }

    detectVerticalShaft () {
        if (!this.bot.entity) {
            return false
        }
        const feet = this.bot.entity.position.floored()
        const body = this.bot.blockAt(feet, false)
        const head = this.bot.blockAt(feet.offset(0, 1, 0), false)
        if (!body || !head || body.boundingBox !== 'empty' || head.boundingBox !== 'empty') {
            return false
        }
        let walls = 0
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const block = this.bot.blockAt(feet.offset(dx, 0, dz), false)
            const above = this.bot.blockAt(feet.offset(dx, 1, dz), false)
            const headroom = this.bot.blockAt(feet.offset(dx, 2, dz), false)
            const below = this.bot.blockAt(feet.offset(dx, -1, dz), false)
            if (block?.boundingBox === 'empty' && above?.boundingBox === 'empty' && below?.boundingBox === 'block') {
                return false
            }
            const lowerFloor = this.bot.blockAt(feet.offset(dx, -2, dz), false)
            if (block?.boundingBox === 'empty' && above?.boundingBox === 'empty' && below?.boundingBox === 'empty' && lowerFloor?.boundingBox === 'block') {
                return false
            }
            if (block?.boundingBox === 'block' && above?.boundingBox === 'empty' && headroom?.boundingBox === 'empty') {
                return false
            }
            if (block && block.boundingBox !== 'empty') {
                walls += 1
            }
        }
        return walls >= 3
    }

    async escapeVerticalShaft () {
        const start = this.bot.entity.position.floored()
        // The bot's own furnace placed in a stair cell once made every retry carve into it (01.19.57).
        const station = (dx, dz) => [1, 2, 3, 4, 5, 6, 7, 8].some(step => [0, 1].some(dy =>
            PROTECTED_CONTAINERS.has(this.bot.blockAt(start.offset(dx * step, step + dy, dz * step), false)?.name)))
        const ranked = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .map(([dx, dz]) => ({ dx, dz, score: station(dx, dz) ? Infinity : this.stairDirectionScore(start, dx, dz, 8) }))
            .filter(direction => Number.isFinite(direction.score))
            .sort((a, b) => a.score - b.score)
        if (ranked.length === 0) {
            throw new Error('no safe direction available for an upward staircase')
        }

        const { dx, dz } = ranked[0]
        this.log.info(`Escaping vertical shaft by carving a staircase toward ${dx},${dz}.`)
        for (let step = 1; step <= 8; step++) {
            const targetFeet = start.offset(dx * step, step, dz * step)
            const support = this.bot.blockAt(targetFeet.offset(0, -1, 0), false)
            if (!support || support.boundingBox === 'empty' || ['water', 'lava'].includes(support.name)) {
                break
            }
            for (const position of [targetFeet.offset(0, 1, 0), targetFeet]) {
                const block = this.bot.blockAt(position, false)
                if (!block || block.boundingBox === 'empty') {
                    continue
                }
                if (['water', 'lava', 'bedrock'].includes(block.name) || PROTECTED_CONTAINERS.has(block.name) || !this.bot.canDigBlock(block)) {
                    throw new Error(`unsafe staircase block ${block.name} at ${block.position}`)
                }
                await this.equipStoneDigTool(block)
                await this.bot.dig(block, true)
            }
            await climbStep(this, targetFeet)
            if (!this.detectVerticalShaft()) {
                this.log.info(`Vertical shaft escape complete at ${this.positionText()}.`)
                return
            }
        }
        if (this.bot.entity.position.y <= start.y + 0.5) {
            throw new Error('staircase escape made no upward progress')
        }
        this.log.info(`Vertical shaft escape made ${Math.floor(this.bot.entity.position.y - start.y)} blocks of upward progress.`)
    }

    stairDirectionScore (start, dx, dz, steps) {
        let score = 0
        for (let step = 1; step <= steps; step++) {
            const targetFeet = start.offset(dx * step, step, dz * step)
            const support = this.bot.blockAt(targetFeet.offset(0, -1, 0), false)
            if (!support || support.boundingBox === 'empty' || ['water', 'lava'].includes(support.name)) {
                // A pit or shelter wall ends at its rim: an open cell beyond the last step with a
                // supported landing at most SAFE_PATHFINDER_DROP below it is an exit.
                const empty = p => this.bot.blockAt(p, false)?.boundingBox === 'empty'
                const level = targetFeet.offset(0, -1, 0)
                if (step === 1 || !empty(level) || !empty(level.offset(0, 1, 0))) {
                    return Infinity
                }
                for (let drop = 0; drop <= SAFE_PATHFINDER_DROP; drop++) {
                    const floor = this.bot.blockAt(level.offset(0, -1 - drop, 0), false)
                    if (floor?.boundingBox === 'block') {
                        return ['lava', 'magma_block', 'water'].includes(floor.name) ? Infinity : score
                    }
                    if (!empty(level.offset(0, -1 - drop, 0))) {
                        return Infinity
                    }
                }
                return Infinity
            }
            const spaces = [targetFeet, targetFeet.offset(0, 1, 0)]
                .map(position => this.bot.blockAt(position, false))
            if (spaces.some(block => !block)) {
                return Infinity
            }
            // Two open blocks above solid support are already a valid staircase exit;
            // do not reject that direction merely because later imaginary steps float.
            if (spaces.every(block => block.boundingBox === 'empty')) {
                return score
            }
            for (const block of spaces) {
                if (!block) {
                    return Infinity
                }
                if (block.boundingBox === 'empty') {
                    continue
                }
                // canDigBlock also enforces the bot's current 5.1-block reach. These
                // future staircase blocks may be farther away now but will be within
                // reach when their step is executed, so preflight only material safety.
                if (['water', 'lava', 'bedrock'].includes(block.name) || !block.diggable) {
                    return Infinity
                }
                score += block.name.includes('stone') || block.name.includes('deepslate') ? 2 : 1
            }
        }
        return score
    }

    detectElevationTrap () {
        if (!this.bot.entity) {
            return null
        }
        const feet = this.bot.entity.position.floored()
        const support = this.bot.blockAt(feet.offset(0, -1, 0))
        if (!support || support.boundingBox === 'empty' || !SAFE_DESCENT_BLOCKS.has(support.name)) {
            return null
        }

        const neighborSurfaceYs = []
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            neighborSurfaceYs.push(this.findNeighborSurfaceY(feet.x + dx, feet.z + dz, support.position.y + 1, 8))
        }
        if (!isIsolatedPillar(support.position.y, neighborSurfaceYs)) {
            return null
        }
        return { feet, support, neighborSurfaceYs }
    }

    findNeighborSurfaceY (x, z, startY, depth) {
        for (let y = startY; y >= startY - depth; y--) {
            const block = this.bot.blockAt(new Vec3(x, y, z), false)
            if (!block) {
                continue
            }
            if (block.boundingBox !== 'empty' && block.name !== 'water' && block.name !== 'lava') {
                return y
            }
        }
        return null
    }

    async descendSafely () {
        let levels = 0
        while (levels < 8) {
            const trap = this.detectElevationTrap()
            if (!trap) {
                if (levels > 0) {
                    this.log.info(`Safe pillar descent complete after ${levels} block${levels === 1 ? '' : 's'}.`)
                }
                return levels
            }

            const nextSupport = this.bot.blockAt(trap.feet.offset(0, -2, 0))
            const supportedBelow = nextSupport && (nextSupport.boundingBox !== 'empty' || nextSupport.name === 'water')
            if (!supportedBelow || nextSupport.name === 'lava') {
                throw new Error('isolated pillar has no safe block immediately below; refusing an uncontrolled fall')
            }
            if (!this.bot.canDigBlock(trap.support)) {
                throw new Error(`cannot dig descent block ${trap.support.name}`)
            }

            const previousY = this.bot.entity.position.y
            await this.equipStoneDigTool(trap.support)
            this.bot.clearControlStates()
            this.log.info(`Safely descending from isolated ${trap.support.name} pillar at ${trap.support.position}.`)
            await this.bot.dig(trap.support, true)
            await waitUntil(() => this.bot.entity.position.y < previousY - 0.6, 4000, 100)
            await sleep(250)
            levels += 1
        }
        throw new Error('safe pillar descent exceeded eight blocks')
    }

    async equipStoneDigTool (block) {
        if (block.material === 'mineable/pickaxe') {
            const pick = miningPickaxe(this, block)
            if (!pick) {
                throw new Error(`digging ${block.name} requires a pickaxe`)
            }
            await this.bot.equip(pick, 'hand')
        } else if (block.material === 'mineable/shovel') {
            const shovel = this.bestItem(DIGGING_SHOVELS)
            if (shovel) {
                await this.bot.equip(shovel, 'hand')
            }
        }
    }

    findSafeLowerLanding (maxRadius = 8) {
        if (!this.bot.entity) {
            return null
        }
        const feet = this.bot.entity.position.floored()
        const supportY = feet.y - 1
        let best = null
        for (let radius = 1; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) {
                        continue
                    }
                    for (let y = supportY - 2; y >= supportY - 4; y--) {
                        const ground = this.bot.blockAt(new Vec3(feet.x + dx, y, feet.z + dz), false)
                        const body = this.bot.blockAt(new Vec3(feet.x + dx, y + 1, feet.z + dz), false)
                        const head = this.bot.blockAt(new Vec3(feet.x + dx, y + 2, feet.z + dz), false)
                        if (!ground || !body || !head) {
                            continue
                        }
                        if (ground.boundingBox === 'empty' || ground.name === 'lava') {
                            continue
                        }
                        if (body.boundingBox !== 'empty' || head.boundingBox !== 'empty') {
                            continue
                        }
                        const drop = supportY - y
                        const distance = Math.hypot(dx, dz)
                        const candidate = { x: feet.x + dx, y: y + 1, z: feet.z + dz, drop, distance }
                        if (!best || candidate.distance < best.distance ||
                                (candidate.distance === best.distance && candidate.drop < best.drop)) best = candidate
                        break
                    }
                }
            }
            if (best) {
                return best
            }
        }
        return null
    }

    async recoverMobility () {
        const minedLevels = await this.descendSafely()
        if (minedLevels > 0) {
            return
        }

        const landing = this.findSafeLowerLanding()
        if (!landing) {
            throw new Error('no safe lower landing found within eight blocks')
        }
        if (!this.movements) {
            throw new Error('path movements are not initialized')
        }

        const previousDrop = this.movements.maxDropDown
        this.log.info(`Trying controlled ${landing.drop}-block descent toward ${landing.x},${landing.y},${landing.z}.`)
        try {
            this.movements.maxDropDown = pathfinderDropLimitForLanding(landing.drop)
            this.bot.pathfinder.setMovements(this.movements)
            await this.gotoWithTimeout(
                new GoalNear(landing.x, landing.y, landing.z, 1),
                15000,
                'controlled descent'
            )
        } finally {
            this.movements.maxDropDown = previousDrop
            this.bot.pathfinder.setMovements(this.movements)
        }
    }

    async gatherWood () {
        const block = await scanFor(this, () => this.findNearestBlock(name =>
            LOG_SUFFIXES.some(suffix => name.endsWith(suffix)) && !name.includes('stripped_'), 48, { mining: true }), { lookUp: true })
        if (!block) {
            return this.scout(36)
        }
        const trunk = this.bot.collectBlock.findFromVein(block, 3, 6, 1)
            .filter(log => log.position.equals(block.position) || blockInView(this.bot, log, exposedByDig(this, log)))
        const signal = this.actionAbort?.signal
        try {
            await this.collectTarget(trunk.length > 0 ? trunk : block, block, 'tree')
        } catch (error) {
            // Remaining logs above standing reach (live 01:07Z, oak at -24,69,194) need a short pillar.
            if (!signal?.aborted && /no path|timed out|not visible or reachable/i.test(error.message) &&
                !this.nearestEntity(HOSTILES, 16) && treePillar(this.bot, block)) {
                try {
                    if (await climbForLog(this, block) > 0) {
                        return
                    }
                } catch (climbError) {
                    if (signal?.aborted) {
                        throw climbError
                    }
                    this.log.warn(`Tree pillar failed: ${climbError.message}`)
                }
            }
            // An unreachable log means an unreachable tree; skip its other logs too. The library's
            // vein search can revisit a log, so a wider bound covers diagonal acacia trunks.
            if (!signal?.aborted) {
                for (const log of [...trunk, ...this.bot.collectBlock.findFromVein(block, 12, 8, 1)]) {
                    this.memory.blockedTargets.set(this.targetKey(log), Date.now() + 120000)
                }
            }
            throw error
        }
    }

    async craftTable () {
        await this.ensurePlanks(4)
        await this.ensureItem('crafting_table', 1, false)
    }

    async craftWoodenPickaxe () {
        if (this.countItems(['stick']) < 2) {
            await this.ensurePlanks(5)
            await this.ensureItem('stick', 4, false)
        }
        await this.ensurePlanks(3)
        await this.ensureItem('wooden_pickaxe', 1, true)
    }

    async gatherStone () {
        const feet = this.bot.entity.position.floored()
        const block = await scanFor(this, () => this.findNearestBlock(name =>
            ['stone', 'cobblestone', 'deepslate', 'cobbled_deepslate'].includes(name), 24, {
            mining: true,
            filter: candidate => candidate.position.x !== feet.x || candidate.position.z !== feet.z
        }))
        if (!block) {
            return mineTunnel(this, 16)
        }
        await this.collectTarget(block, block, 'stone')
    }

    async craftStonePickaxe () {
        if (this.countItems(['stick']) < 2) {
            await this.ensurePlanks(2)
            await this.ensureItem('stick', 4, false)
        }
        await this.ensureItem('stone_pickaxe', 1, true)
    }

    async craftFurnace () {
        await this.ensureItem('furnace', 1, true)
    }

    async craftIronPickaxe () {
        if (this.countItems(['stick']) < 2) {
            await this.ensurePlanks(2)
            await this.ensureItem('stick', 4, false)
        }
        await this.ensureItem('iron_pickaxe', 1, true)
        await this.bot.equip(this.bestItem(['iron_pickaxe']), 'hand')
        this.log.info('Equipped iron_pickaxe for mining.')
    }

    async gatherFood (state) {
        if (await this.gatherMushroomStew(state)) {
            return
        }
        const target = await scanFor(this, () => this.findNearestBlock(name => name === 'sweet_berry_bush', 32, { mining: true }) ||
            this.nearestEntity(PREY, 48))
        if (target?.name === 'sweet_berry_bush') {
            await this.collectTarget(target, target, 'berries')
            return
        }
        if (target) {
            return this.fight(target, true)
        }
        if (state.foodOpportunity) {
            return this.perform(state.foodOpportunity.action, state)
        }
        if (await waitForFish(this)) {
            return
        }
        await this.scout(28)
    }

    async gatherMushroomStew (state) {
        const signal = this.actionAbort?.signal
        const mushrooms = ['red_mushroom', 'brown_mushroom']
        if (!this.countItems(['bowl']) && !(state.hasCraftingTable && (state.planks >= 3 || state.logs > 0))) {
            return false
        }
        for (let attempt = 0; attempt <= 4; attempt++) {
            this.checkAction(signal)
            const missing = mushrooms.filter(name => !this.countItems([name]))
            if (missing.length === 0) {
                if (!this.countItems(['bowl'])) {
                    await this.ensurePlanks(3)
                    this.checkAction(signal)
                    await this.craftItem('bowl', 1, true)
                    this.checkAction(signal)
                }
                await this.craftItem('mushroom_stew', 1, false)
                return true
            }
            if (attempt === 4) {
                return true
            }
            const targets = missing.map(name => this.findNearestBlock(
                block => block === name || block === `${name}_block`, 16, { mining: true }
            ))
            if (targets.some(block => !block)) {
                return false
            }
            const target = targets[0]
            await this.collectTarget(target, target, target.name)
        }
    }

    async gatherOre (names, radius) {
        const wanted = new Set(names)
        const feet = this.bot.entity.position.floored()
        const block = await scanFor(this, () => this.findNearestBlock(name => wanted.has(name), radius, {
            sight: b => miningSight(this, b, radius),
            filter: candidate => candidate.position.x !== feet.x || candidate.position.z !== feet.z
        }))
        if (!block) {
            if (await collectOpportunity(this, names) || await exploreCave(this, names.includes('iron_ore') ? 16 : feet.y)) {
                return
            }
            return mineTunnel(this, names.includes('iron_ore') ? 16 : feet.y)
        }
        await this.collectTarget(block, block, block.name)
    }

    // The decision loop's opportunistic targets, cheaply: null, 'diamond', 'iron' or a food action.
    priorityTargetInView (allowOre = true) {
        try {
            if (!this.mcData || !this.canPursueDiamond()) {
                return null
            }
            if (allowOre && findPriorityDiamond(this)) {
                return 'diamond'
            }
            if (allowOre && this.ironWanted && findPriorityOre(this, IRON_ORES)) {
                return 'iron'
            }
            const items = this.bot.inventory.items()
            if (this.bot.health < 12 || mealReserve(items) >= MIN_MINING_MEALS || this.bot.inventory.emptySlotCount() < 1 ||
                this.visibleThreatCount(12) > 0) {
                return null
            }
            const food = foodOpportunity(this, { hasCraftingTable: false, planks: 0, logs: 0 })
            return food && food.action !== 'gather_mushroom_stew' ? food.action : null
        } catch (error) {
            this.log.warn(`Opportunity check failed: ${error.message}`)
            return null
        }
    }

    canPursueDiamond () {
        return this.bot.health > 10 && (this.bot.food > 16 || this.bestFood()) &&
            this.bot.inventory.emptySlotCount() > 0 && !this.detectVerticalShaft() && this.visibleThreatCount(6) === 0
    }

    async collectTarget (target, anchor = target, label = 'resource') {
        const collection = { anchor, label }
        this.activeCollection = collection
        const signal = this.actionAbort?.signal
        try {
            const targets = Array.isArray(target) ? target : [target]
            for (const entry of targets) {
                if (signal?.aborted || !this.running || this.paused) {
                    throw new Error('collection cancelled')
                }
                if (entry.name === 'item') {
                    // Pickup reaches about one block; one unreachable stack must not strand the reachable rest.
                    if (entry.isValid && this.canSee(entry)) {
                        const p = entry.position.floored()
                        await this.gotoWithTimeout(droppedItemGoal(entry), 8000, 'item pickup')
                            .catch(error => {
                                if (signal?.aborted || targets.length === 1) {
                                    throw error
                                }
                                this.log.warn(`Skipping unreachable item at ${p}: ${error.message}`)
                            })
                        await sleep(500)
                    }
                    continue
                }
                const block = this.bot.blockAt(entry.position)
                if (!block || block.type !== entry.type || (block.boundingBox === 'empty' && !block.diggable)) {
                    continue
                }
                let sight = block.name.endsWith('_ore') && miningSight(this, block, 4.5)
                if (!this.bot.canDigBlock(block) || (!sight && !canSeeBlock(this.bot, block))) {
                    const view = { raycast: (from, direction, range) => sightRay(this.bot, from, direction, range) }
                    await this.gotoWithTimeout(reachGoal(block.position, view), 10000, 'resource approach')
                    sight = block.name.endsWith('_ore') && miningSight(this, block, 4.5)
                }
                if (signal?.aborted) {
                    throw new Error('collection cancelled')
                }
                const feet = this.bot.entity.position.floored()
                if (block.position.x === feet.x && block.position.z === feet.z && block.position.y < feet.y) {
                    throw new Error('refusing to mine the support block under the bot')
                }
                if (!this.movements.safeToBreak(block)) {
                    throw new Error(`unsafe block to mine: ${block.name}`)
                }
                if (!this.bot.canDigBlock(block) || (!sight && !canSeeBlock(this.bot, block))) {
                    throw new Error(`block is not visible or reachable: ${block.name}`)
                }
                await this.bot.tool.equipForBlock(block, { requireHarvest: true, getFromChest: false })
                if (signal?.aborted) {
                    throw new Error('collection cancelled')
                }
                if (!block.canHarvest(this.bot.heldItem?.type)) {
                    throw new Error(`missing harvesting tool for ${block.name}`)
                }
                if (block.material === 'mineable/axe') {
                    this.log.debug?.(`Breaking ${block.name} with ${this.bot.heldItem?.name || 'bare hands'}.`)
                }
                if (sight) {
                    await this.bot.lookAt(sight, true)
                    await this.bot.waitForTicks(1)
                    this.checkAction(signal)
                }
                await this.bot.dig(block, sight ? 'ignore' : true)
                await sleep(600)
                if (signal?.aborted) {
                    throw new Error('collection cancelled')
                }
                // Our own drop may land behind stone or in a pit out of view (live 01:54Z left raw iron);
                // turn to it, follow it, then stand in its cell if the server has not collected it.
                const drops = this.visibleDrops(block.position.offset(0.5, 0.5, 0.5), 3, false)
                const collected = drop => waitUntil(() => !drop.isValid, 1000, 100).then(() => true, () => false)
                for (const drop of drops) {
                    if (signal?.aborted) {
                        throw new Error('collection cancelled')
                    }
                    if (!drop.isValid) {
                        continue
                    }
                    if (!this.canSee(drop)) {
                        await this.bot.lookAt(drop.position, true)
                    }
                    try {
                        await this.gotoWithTimeout(droppedItemGoal(drop), label === 'tree' ? 4000 : 8000, 'mined item pickup')
                        if (!await collected(drop)) {
                            const p = drop.position.floored()
                            await this.gotoWithTimeout(new GoalNear(p.x, p.y, p.z, 0), 4000, 'mined item cell')
                            await collected(drop)
                        }
                    } catch (error) {
                        if (signal?.aborted) {
                            throw error
                        }
                        this.log.warn(`Skipping ${label} drop pickup: ${error.message}`)
                    }
                    if (drop.isValid) {
                        this.log.warn(`Left a mined ${drop.getDroppedItem?.()?.name ?? 'item'} at ${drop.position.floored()}.`)
                    }
                }
                await sleep(300)
            }
        } catch (error) {
            if (!signal?.aborted) {
                this.rememberBlockedTarget(anchor, label, error)
            }
            throw error
        } finally {
            if (this.activeCollection === collection) {
                this.activeCollection = null
            }
        }
    }

    targetKey (block) {
        const p = block.position
        return `${p.x},${p.y},${p.z}`
    }

    rememberBlockedTarget (block, label, error) {
        if (!block || !block.position) {
            return
        }
        const key = this.targetKey(block)
        const wasBlocked = (this.memory.blockedTargets.get(key) || 0) > Date.now()
        this.memory.blockedTargets.set(key, Date.now() + 120000)
        if (!wasBlocked) {
            this.log.warn(`Remembering unreachable ${label} at ${key} for 120s: ${error.message}`)
        }
    }

    isBlockedTarget (block) {
        if (!block || !block.position) {
            return false
        }
        const key = this.targetKey(block)
        const expires = this.memory.blockedTargets.get(key)
        if (!expires) {
            return false
        }
        if (expires <= Date.now()) {
            this.memory.blockedTargets.delete(key)
            return false
        }
        return true
    }

    // Fire-and-forget smelting: load all raw iron with enough fuel, record a job and keep
    // working; standing at furnaces cost ~29 min on 2026-11-05 (strategy.md).
    async smeltIron (batchSize = 64, plankFuel = null) {
        // The pre-job pendingSmelt flag is retired here so a stale value cannot loop the planner.
        this.memory.pendingSmelt = false
        const job = this.memory.smeltJob
        if (job && job.dimension === this.bot.game.dimension) {
            return this.collectSmelt(job)
        }
        const furnaceBlock = await this.getFurnace()
        const furnace = await this.bot.openFurnace(furnaceBlock)
        try {
            if (furnace.outputItem()?.name === 'iron_ingot') {
                await furnace.takeOutput()
            }
            if (furnace.inputItem() && furnace.inputItem().name !== 'raw_iron') {
                throw new Error(`furnace contains unexpected input: ${furnace.inputItem().name}`)
            }
            const rawIron = this.bestItem(['raw_iron'])
            if (!rawIron) {
                return
            }
            const count = Math.min(batchSize - (furnace.inputItem()?.count || 0), this.countItems(['raw_iron']))
            if (count > 0) {
                await furnace.putInput(rawIron.type, rawIron.metadata, count)
            }
            const total = furnace.inputItem()?.count || count
            const p = furnaceBlock.position
            // Record before fuelling: a fuel error once left 30 raw iron in an unremembered furnace.
            this.memory.smeltJob = { dimension: this.bot.game.dimension, x: p.x, y: p.y, z: p.z, count: total, readyAt: Date.now() + total * 10000 + 1000 }
            const present = furnace.fuelItem()
            // One coal or charcoal smelts eight items; other fuel already in the slot is used as is.
            const fuelNeeded = Math.ceil(total / 8) - (['coal', 'charcoal'].includes(present?.name) ? present.count : 0)
            if (!present && plankFuel) {
                const plank = this.bestItem([plankFuel.name])
                if (!plank || this.countItems([plank.name]) < plankFuel.count) {
                    throw new Error('plank fuel is missing')
                }
                await furnace.putFuel(plank.type, plank.metadata, plankFuel.count)
            } else if (fuelNeeded > 0 && (!present || ['coal', 'charcoal'].includes(present.name))) {
                const fuel = this.bestItem(present ? [present.name] : ['coal', 'charcoal'])
                if (!fuel && !present) {
                    throw new Error('coal or charcoal is missing')
                }
                if (fuel) {
                    await furnace.putFuel(fuel.type, fuel.metadata, Math.min(fuelNeeded, this.countItems([fuel.name])))
                        .catch(error => this.log.warn(`Could not add fuel: ${error.message}`))
                }
            }
            this.log.info(`Smelting ${total} raw iron at ${p}; continuing work until about ${Math.ceil(total * 10)} s from now.`)
        } finally {
            await this.bot.closeWindow(furnace).catch(() => {})
        }
    }

    async collectSmelt (job) {
        const position = new Vec3(job.x, job.y, job.z)
        if (this.bot.entity.position.distanceTo(position.offset(0.5, 0.5, 0.5)) > 4) {
            try {
                await this.gotoWithTimeout(new GoalNear(position.x, position.y, position.z, 2), 30000, 'furnace return')
            } catch (error) {
                // A respawned bot found its 32-iron furnace 20 blocks down with no walking path
                // (02.59.01); tunnel toward it, and forget the job only after twelve segments.
                if (!/no path|timed out/i.test(error.message) || this.actionAbort?.signal.aborted) {
                    throw error
                }
                job.tunnels = (job.tunnels || 0) + 1
                if (job.tunnels > 12) {
                    this.log.warn(`Abandoning the unreachable smelt job at ${position} (${job.count} raw iron).`)
                    this.memory.smeltJob = null
                    throw error
                }
                this.log.info(`No walking route to the furnace at ${position}; tunneling toward it (${job.tunnels}/12).`)
                // A failed goto defers its stop and would abort the first dig (F004).
                this.bot.pathfinder.setGoal(null)
                await this.bot.waitForTicks(2)
                this.checkAction()
                return mineTunnel(this, position.y, position)
            }
        }
        const block = this.bot.blockAt(position)
        if (block?.name !== 'furnace') {
            this.memory.smeltJob = null
            throw new Error(`smelting furnace at ${position} is gone`)
        }
        const furnace = await this.bot.openFurnace(block)
        const burning = () => furnace.fuel > 0 || this.bot.blockAt(position)?.getProperties?.().lit === true
        let finished = false
        try {
            if (!job.needsFuel && (burning() || furnace.fuelItem())) {
                await until(this, () => !furnace.inputItem(), 5000).catch(() => {})
            }
            this.checkAction()
            if (furnace.outputItem()) {
                await furnace.takeOutput()
            }
            if (!furnace.inputItem()) {
                if (furnace.fuelItem()) {
                    await furnace.takeFuel()
                }
                finished = true
                this.memory.smeltJob = null
            } else {
                const left = furnace.inputItem().count
                job.count = left
                job.needsFuel = !furnace.fuelItem() && !burning()
                if (job.needsFuel) {
                    const fuel = this.bestItem(['coal', 'charcoal'])
                    if (fuel) {
                        await furnace.putFuel(fuel.type, fuel.metadata, Math.min(Math.ceil(left / 8), this.countItems([fuel.name])))
                        job.needsFuel = false
                    }
                }
                job.readyAt = Date.now() + left * 10000 + 1000
            }
        } finally {
            await this.bot.closeWindow(furnace).catch(() => {})
        }
        const status = finished ? 'job complete' : job.needsFuel ? 'input waiting for fuel' : 'input still smelting'
        this.log.info(`Checked iron smelt at ${position}; ${status}.`)
        if (finished && !this.hasItem('raw_iron') && this.running && !this.actionAbort?.signal.aborted) {
            await this.reclaimStation(block).catch(error => this.log.warn(`Could not reclaim furnace: ${error.message}`))
        }
    }

    async eat () {
        const food = this.bestFood()
        if (!food) {
            throw new Error('no edible item in inventory')
        }
        await this.bot.equip(food, 'hand')
        await this.bot.consume()
    }

    async fight (entity, hunt = false, guard = null, cornered = false) {
        const signal = this.actionAbort?.signal
        this.checkAction(signal)
        if (entity?.name === 'enderman') {
            throw new Error('endermen require refuge, not combat')
        }
        if (!entity || !entity.isValid) {
            throw new Error('target disappeared')
        }
        const swords = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword']
        const axes = [...WOODCUTTING_AXES, 'golden_axe', 'wooden_axe']
        const weapon = this.bestItem(hunt ? [...axes, ...swords] : [...swords, ...axes])
        if (weapon) {
            await this.bot.equip(weapon, 'hand')
            this.checkAction(signal)
        }
        const deadline = Date.now() + 20000
        const huntCooldownMs = hunt ? HUNT_AXE_COOLDOWN_MS[weapon?.name] || 0 : 0
        let nextHuntAttackAt = Date.now() + huntCooldownMs
        let chasePosition = this.bot.entity.position.clone()
        let chaseProgressAt = Date.now()
        let following = false
        let shielding = false
        // Defensive swings rotate over every attacker at arm's length: locking onto one zombie let the
        // other hit freely, and a kill ended the action while the second kept attacking (staged 02:21Z).
        const lastSwing = new Map()
        this.bot.pathfinder.setMovements?.(dryMovements(this.bot))
        try {
            while (Date.now() < deadline) {
                if (!entity.isValid && !hunt) {
                    entity = this.closeMelee() ?? entity
                }
                if (!entity.isValid) {
                    break
                }
                this.checkAction(signal)
                const reason = guard?.()
                if (reason) {
                    throw new Error(reason)
                }
                // Twelve or more armor points make a lone melee duel safer than running (F030).
                if (!hunt && !cornered && !canSustainFight(this.bot.health, wornArmorPoints(this.bot))) {
                    this.urgentReplan = true
                    throw new Error('combat health too low; replanning escape')
                }
                const meleeOnly = kiteableCrowd(this)
                const crowd = updateCrowdRetreat(this, HOSTILES) && !meleeOnly
                if (!hunt && (crowd || (!cornered && outnumbered(this.visibleThreatCount(), wornArmorPoints(this.bot), meleeOnly)))) {
                    this.urgentReplan = true
                    throw new Error('outnumbered in combat; replanning escape')
                }
                const distance = this.bot.entity.position.distanceTo(entity.position)
                if (hunt && !this.canSee(entity)) {
                    throw new Error('prey went out of view')
                }
                // An approaching zombie is awaited at reach, not walked into (we back off to stay out of its reach).
                if (distance > 3.1 && (hunt || !MELEE.has(entity.name) || distance > 6)) {
                    kite(this, null)
                    if (!following || this.bot.targetDigBlock || chasePosition.distanceTo(this.bot.entity.position) >= 0.75) {
                        chasePosition = this.bot.entity.position.clone()
                        chaseProgressAt = Date.now()
                    } else if (hunt && Date.now() - chaseProgressAt >= 8000) {
                        const stalled = new Error('prey pursuit stalled for 8s')
                        this.rememberBlockedTarget(entity, 'prey', stalled)
                        throw stalled
                    }
                    if (!following) {
                        this.bot.pathfinder.setGoal(new GoalFollow(entity, 2), true)
                        following = true
                    }
                    // Charging an archer, keep the shield up: the follow path faces it, so arrows
                    // hit the shield (Not Today, Thank You) instead of the bot (F027, F031).
                    if (ARCHERS.has(entity.name) && this.bot.inventory?.slots[45]?.name === 'shield' && !shielding) {
                        this.bot.activateItem(true)
                        shielding = true
                    }
                    await sleep(300)
                } else {
                    if (shielding) {
                        this.bot.deactivateItem()
                        shielding = false
                    }
                    this.bot.pathfinder.setGoal(null)
                    following = false
                    const here = this.bot.entity.position
                    const target = hunt ? entity : [entity, ...Object.values(this.bot.entities || {}).filter(e => e !== entity &&
                        e.isValid && MELEE.has(e.name) && here.distanceTo(e.position) <= 3.1)]
                        .reduce((a, b) => (lastSwing.get(b.id) ?? 0) < (lastSwing.get(a.id) ?? 0) ? b : a)
                    await this.bot.lookAt(target.position.offset(0, Math.min(target.height || 1, 1.4), 0), true)
                    this.checkAction(signal)
                    // A zombie's reach (~1.5 blocks) is half ours and it is slower than a walking player:
                    // back off whenever melee is inside 2.5 blocks while swinging at 3 (user kiting advice).
                    const moving = hunt ? null : kite(this, Object.values(this.bot.entities || {}).filter(e =>
                        e.isValid && MELEE.has(e.name) && here.distanceTo(e.position) <= 4))
                    if (Date.now() < nextHuntAttackAt || here.distanceTo(target.position) > 3) {
                        await sleep(Math.max(20, Math.min(100, nextHuntAttackAt - Date.now())))
                        continue
                    }
                    if (this.bot.inventory?.slots[45]?.name === 'shield' && (!hunt || guard) && !moving) {
                        this.bot.activateItem(true)
                        await sleep(350)
                        this.bot.deactivateItem()
                        this.checkAction(signal)
                        const changed = guard?.()
                        if (changed) {
                            throw new Error(changed)
                        }
                    }
                    if (!target.isValid) {
                        continue
                    }
                    this.bot.attack(target)
                    lastSwing.set(target.id, Date.now())
                    this.combatLiveAt = Date.now()
                    // Mobs ignore hits for 10 ticks after one lands: swinging every 0.5 s keeps every
                    // attacker knocked back (user: spam-clicking holds off a hallway of zombies).
                    nextHuntAttackAt = Date.now() + (huntCooldownMs || 500)
                    await sleep(100)
                }
            }
            this.checkAction(signal)
            this.bot.pathfinder.setGoal(null)
            if (entity.isValid) {
                if (hunt) {
                    this.rememberBlockedTarget(entity, 'prey', new Error('combat timed out'))
                }
                throw new Error('combat timed out')
            }
            await sleep(800)
            this.checkAction(signal)
            const reason = guard?.()
            if (reason) {
                throw new Error(reason)
            }
            if (hunt) {
                const drops = this.visibleDrops(entity.position, 4)
                if (drops.length > 0) {
                    await this.collectTarget(drops, null, 'hunting drops')
                }
            }
        } finally {
            kite(this, null)
            if (shielding) {
                this.bot.deactivateItem()
            }
            this.bot.pathfinder.setGoal(null)
            this.bot.deactivateItem?.()
            this.bot.pathfinder.setMovements?.(this.movements)
        }
    }

    // Melee within three blocks is known without sight: it is hitting us, and zombies at arm's length sit
    // below the eye's view cone (staged 02:21Z: two "unseen" zombies killed a cornered bot).
    closeMelee (range = 3) {
        const here = this.bot.entity.position
        return Object.values(this.bot.entities || {}).filter(e => e.isValid && MELEE.has(e.name) && here.distanceTo(e.position) <= range)
            .sort((a, b) => here.distanceTo(a.position) - here.distanceTo(b.position))[0] || null
    }

    async escapeFrom (entity) {
        if (!entity) {
            return this.randomWalk(16)
        }
        const here = this.bot.entity.position
        const away = here.minus(entity.position)
        const length = Math.max(Math.sqrt(away.x * away.x + away.z * away.z), 0.01)
        const x = Math.floor(here.x + (away.x / length) * 16)
        const z = Math.floor(here.z + (away.z / length) * 16)
        this.bot.pathfinder.setMovements(dryMovements(this.bot))
        try {
            await this.gotoWithTimeout(new GoalNear(x, Math.floor(here.y), z, 3), 6000, 'combat escape')
        } finally {
            this.bot.pathfinder.setMovements(this.movements)
        }
    }

    configureLooking () {
        const bot = this.bot
        const look = bot.look.bind(bot)
        const safe = (yaw, pitch) => {
            const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
            const direction = new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
            return !Object.values(bot.entities).some(e => {
                if (!e.isValid || e.name !== 'enderman') {
                    return false
                }
                const head = e.position.offset(0, 2.55, 0).minus(eye)
                const distance = head.norm()
                const along = head.dot(direction)
                const radius = Math.max(0.85, Math.sqrt(0.05 * distance) + 0.15)
                return distance <= 64 && along > 0 && head.minus(direction.scaled(along)).norm() < radius &&
                    !sightRay(bot, eye, head.normalize(), distance)
            })
        }
        bot.look = async (yaw, pitch, force) => {
            const near = Object.values(bot.entities).some(e => e.isValid && e.name === 'enderman' &&
                e.position.distanceTo(bot.entity.position) <= 64)
            if (!near) {
                return look(yaw, pitch, force)
            }
            for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
                for (const candidate of [pitch, -Math.PI / 3, -Math.PI / 2, 0, Math.PI / 3, Math.PI / 2]) {
                    if (safe(yaw + offset, candidate)) {
                        // Force skips Mineflayer's intermediate yaw sweep through an enderman's face.
                        return look(yaw + offset, candidate, true)
                    }
                }
            }
            return look(yaw, -Math.PI / 2, true)
        }
        bot.on('physicsTick', () => {
            if (bot.entity && !safe(bot.entity.yaw, bot.entity.pitch)) {
                bot.look(bot.entity.yaw, bot.entity.pitch, true).catch(error => this.log.warn(`Safe look failed: ${error.message}`))
            }
        })
    }

    endermanDanger () {
        const now = Date.now()
        const dimension = this.bot.game.dimension
        const keys = this.bot.registry?.entitiesByName?.enderman?.metadataKeys || []
        const angry = e => Boolean(e.metadata?.[keys.indexOf('creepy')] || e.metadata?.[keys.indexOf('stared_at')])
        const seen = Object.values(this.bot.entities || {}).find(e => e.isValid && e.name === 'enderman' &&
            e.position.distanceTo(this.bot.entity.position) <= 24 && angry(e) && this.canSee(e))
        if (seen) {
            this.endermanThreat = { id: seen.id, dimension, at: now }
        }
        const threat = this.endermanThreat
        if (!threat || threat.dimension !== dimension) {
            this.endermanThreat = null
            return false
        }
        const entity = this.bot.entities[threat.id]
        if ((!entity?.isValid && now - threat.at > 60000) ||
            (entity?.isValid && !angry(entity) && this.canSee(entity) && now - threat.at > 5000)) {
            this.endermanThreat = null
            return false
        }
        return true
    }

    async avoidEnderman () {
        this.checkAction()
        this.bot.pathfinder.setGoal(null)
        this.bot.clearControlStates()
        const enclosed = () => this.shelterCenter && this.hasEnclosedShelter(this.shelterCenter)
        if (!enclosed()) {
            const feet = this.bot.entity.position.floored()
            const water = this.bestItem(['water_bucket'])
            if (water && this.bot.game.dimension !== 'the_nether' &&
                this.bot.blockAt(feet.offset(0, -1, 0), false)?.boundingBox === 'block') {
                await this.bot.equip(water, 'hand')
                this.checkAction()
                await this.bot.lookAt(feet.offset(0.5, -0.1, 0.5), true)
                this.bot.activateItem()
                this.bot.deactivateItem()
                await this.bot.waitForTicks(4)
                this.checkAction()
                this.log.warn(`Enderman refuge: poured water at ${feet}.`)
            }
            try {
                await this.burrow()
            } catch (error) {
                this.checkAction()
                this.log.warn(`Enderman burrow unavailable: ${error.message}; carving a low side refuge.`)
                await this.endermanSideRefuge().catch(async sideError => {
                    this.checkAction()
                    this.log.warn(`Side refuge unavailable: ${sideError.message}; building enclosure.`)
                    await this.makeNightSafe()
                })
            }
        }
        this.checkAction()
        if (!enclosed()) {
            throw new Error('enderman refuge is not enclosed')
        }
        this.log.info('Enderman refuge verified; keeping the enclosure closed.')
        if (this.bot.food < 20 && this.bestFood()) {
            await this.eat()
        }
        for (let tick = 0; tick < 40 && this.endermanDanger(); tick++) {
            this.checkAction()
            await this.bot.waitForTicks(1)
        }
    }

    async endermanSideRefuge () {
        const origin = this.bot.entity.position.floored()
        const at = p => this.bot.blockAt(p, false)
        const solid = p => at(p)?.boundingBox === 'block' && !['magma_block', 'cactus', 'powder_snow'].includes(at(p).name)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const cells = [1, 2].flatMap(n => [1, 0].map(dy => origin.offset(n * dx, dy, n * dz)))
            const center = origin.offset(2 * dx, 0, 2 * dz)
            if (!cells.every(p => solid(p) && at(p).diggable && !PROTECTED_CONTAINERS.has(at(p).name) &&
                !['sand', 'red_sand', 'gravel'].includes(at(p).name) &&
                (at(p).material !== 'mineable/pickaxe' || miningPickaxe(this, at(p)))) ||
                ![1, 2].every(n => solid(origin.offset(n * dx, -1, n * dz)) && solid(origin.offset(n * dx, 2, n * dz))) ||
                ![-1, 0, 1].every(x => [-1, 0, 1].every(z => [0, 1].every(y => solid(center.offset(x, y, z)))))) {
                continue
            }
            for (const cell of cells) {
                this.checkAction()
                await this.equipStoneDigTool(at(cell))
                this.checkAction()
                await this.bot.dig(at(cell), true)
            }
            await this.gotoWithTimeout(new goals.GoalBlock(center.x, center.y, center.z), 3000, 'low enderman refuge')
            for (const dy of [0, 1]) {
                await this.placeSurvivalBlock(origin.offset(dx, dy, dz))
            }
            this.checkAction()
            if (!this.hasEnclosedShelter(center)) {
                throw new Error('side refuge enclosure incomplete')
            }
            this.shelterCenter = center.clone()
            this.memory.shelter = { x: center.x, y: center.y, z: center.z, dimension: this.bot.game.dimension, burrowed: true }
            this.sheltered = true
            return
        }
        throw new Error('no enclosed two-high side passage')
    }

    canSee (entity) {
        const eye = this.bot.entity.position.offset(0, this.bot.entity.eyeHeight ?? 1.62, 0)
        return [0.25, 0.75].some(fraction => {
            const target = entity.position.offset(0, (entity.height ?? 1.6) * fraction, 0)
            const ray = target.minus(eye)
            const range = ray.norm()
            return inView(this.bot, eye, target) && !sightRay(this.bot, eye, ray.normalize(), range)
        })
    }

    visibleThreatCount (range = 5) {
        const position = this.bot.entity.position
        return Object.values(this.bot.entities || {}).filter(entity => entity.isValid && HOSTILES.has(entity.name) &&
            position.distanceTo(entity.position) <= range && this.canSee(entity)).length
    }

    visibleDrops (position, radius, requireSight = true) {
        return Object.values(this.bot.entities || {}).filter(entity => entity.isValid && entity.name === 'item' &&
            entity.position.distanceTo(position) <= radius && (!requireSight || this.canSee(entity)))
    }

    // Creepers only swell and archers only shoot with line of sight, and outrunning either
    // while digging rarely works underground. Seal a narrow passage facing it, otherwise flee.
    async takeCover (threat, clearDistance = 10) {
        const signal = this.actionAbort?.signal
        const feet = this.bot.entity.position.floored()
        const toward = threat.position.minus(this.bot.entity.position)
        const openings = []
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (dx * toward.x + dz * toward.z <= 0) {
                continue
            }
            for (const dy of [0, 1, 2]) {
                const cell = feet.offset(dx, dy, dz)
                if (this.isEmptyPlacementBlock(this.bot.blockAt(cell, false)) && !threat.position.floored().equals(cell)) {
                    openings.push(cell)
                }
            }
        }
        if (openings.length && openings.length <= 4 && this.countItems(BUILDING_BLOCKS) >= openings.length) {
            for (const cell of openings) {
                this.checkAction(signal)
                await this.placeSurvivalBlock(cell).catch(error => this.log.warn(`Cover placement failed at ${cell}: ${error.message}`))
            }
            this.checkAction(signal)
            if (!this.canSee(threat)) {
                this.log.info(`Sealed ${openings.length} opening(s) toward a ${threat.name} at ${threat.position.floored()}.`)
                return
            }
        }
        // A creeper within four blocks outpaces a fleeing bot, which then takes the blast in the back.
        const brace = () => threat.name === 'creeper' && this.bot.inventory?.slots[45]?.name === 'shield' &&
            this.bot.entity.position.distanceTo(threat.position) <= 4
        if (brace()) {
            return this.braceAgainst(threat)
        }
        this.log.info(`Fleeing ${threat.name} at ${threat.position.floored()}; ${openings.length} facing opening(s) could not be sealed.`)
        // Pausing between single legs let a following creeper close in and explode (F027).
        for (let leg = 0; leg < 4 && threat.isValid !== false && this.canSee(threat) &&
            this.bot.entity.position.distanceTo(threat.position) < clearDistance; leg++) {
            this.checkAction(signal)
            await this.escapeFrom(threat)
            if (brace()) {
                return this.braceAgainst(threat)
            }
        }
    }

    // The solid, non-liquid block filling the bot's eye cell, if any.
    suffocatingBlock () {
        const entity = this.bot.entity
        const eye = entity && this.bot.blockAt?.(entity.position.offset(0, entity.eyeHeight ?? 1.62, 0), false)
        return eye?.boundingBox === 'block' && eye.diggable !== false ? eye : null
    }

    async clearHead () {
        const block = this.suffocatingBlock()
        if (!block) {
            return
        }
        this.log.warn(`Suffocating inside ${block.name} at ${block.position}; digging it out.`)
        await this.bot.tool?.equipForBlock?.(block, { requireHarvest: false, getFromChest: false }).catch(() => {})
        await this.bot.dig(block, true)
    }

    inLava () {
        const feet = this.bot.entity?.position.floored()
        return Boolean(this.bot.entity?.isInLava || (feet && [feet, feet.offset(0, 1, 0)]
            .some(p => ['lava', 'fire', 'soul_fire'].includes(this.bot.blockAt?.(p, false)?.name))))
    }

    // Water poured at the feet quenches the lava there; then step to the nearest dry, solid-floored cell.
    async escapeLava () {
        const feet = this.bot.entity.position.floored()
        const water = this.bot.inventory.items().find(item => item.name === 'water_bucket')
        if (water) {
            await this.bot.equip(water, 'hand')
            await this.bot.lookAt(feet.offset(0.5, 0, 0.5), true)
            this.bot.activateItem()
            this.bot.deactivateItem()
        }
        const hot = p => ['lava', 'fire', 'soul_fire', 'magma_block'].includes(this.bot.blockAt(p, false)?.name)
        const clear = p => this.bot.blockAt(p, false)?.boundingBox === 'empty' && !hot(p)
        let best = null
        for (let dx = -4; dx <= 4; dx++) {
            for (let dz = -4; dz <= 4; dz++) {
                for (let dy = -1; dy <= 2; dy++) {
                    const p = feet.offset(dx, dy, dz)
                    const floor = this.bot.blockAt(p.offset(0, -1, 0), false)
                    if ((dx || dz) && clear(p) && clear(p.offset(0, 1, 0)) && floor?.boundingBox === 'block' && !hot(p.offset(0, -1, 0)) &&
                        (!best || feet.distanceTo(p) < feet.distanceTo(best))) {
                        best = p
                    }
                }
            }
        }
        this.log.warn(`Burning in lava at ${feet}; ${water ? 'poured water, ' : ''}${best ? `stepping to ${best}` : 'no dry cell nearby'}.`)
        if (!best) {
            return
        }
        // Drive straight out first: a pathfinder goto from inside lava left the bot in place (17:30:25Z).
        await this.bot.lookAt(best.offset(0.5, 1.6, 0.5), true)
        const controls = ['forward', 'sprint', 'jump']
        controls.forEach(control => this.bot.setControlState(control, true))
        try {
            for (let t = 0; t < 12 && this.inLava(); t++) {
                await sleep(100)
            }
        } finally {
            controls.forEach(control => this.bot.setControlState(control, false))
        }
        if (!this.inLava()) {
            return
        }
        this.bot.setControlState('jump', true)
        try {
            await this.gotoWithTimeout(new goals.GoalBlock(best.x, best.y, best.z), 4000, 'lava escape')
        } finally {
            this.bot.setControlState('jump', false)
        }
    }

    // An escape that has not left its starting cell for a second while a melee mob is adjacent.
    escapePinned () {
        const origin = this.escapeOrigin
        return Boolean(origin && (this.activeAction || this.lastAction) === Actions.ESCAPE && Date.now() - origin.at >= 1000 &&
            this.bot.entity.position.distanceTo(origin.position) < 1.2 && this.nearestEntity?.(MELEE, 2.5))
    }

    async surfaceForAir () {
        const bot = this.bot
        const air = new Set(['air', 'cave_air', 'void_air'])
        const passable = p => {
            const block = bot.blockAt(p, false)
            return block?.boundingBox === 'empty' && !['lava', 'fire', 'soul_fire', 'cobweb'].includes(block.name)
        }
        bot.pathfinder?.setGoal(null)
        bot.clearControlStates?.()
        this.log.warn(`Low air (${bot.oxygenLevel}/20); taking direct control to reach breathable space.`)
        const deadline = Date.now() + 6000
        let next = null
        try {
            for (let tick = 0; tick < 120 && Date.now() < deadline && (bot.oxygenLevel ?? 20) < 18; tick++) {
                this.checkAction()
                if (tick % 4 === 0) {
                    const feet = bot.entity.position.floored()
                    const queue = [{ p: feet, first: null }]
                    const seen = new Set([feet.toString()])
                    next = null
                    for (let i = 0; i < queue.length && i < 2048; i++) {
                        const { p, first } = queue[i]
                        if (first && air.has(bot.blockAt(p.offset(0, 1, 0), false)?.name)) {
                            next = first
                            break
                        }
                        for (const [x, y, z] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
                            const q = p.offset(x, y, z)
                            if (seen.has(q.toString()) || Math.abs(q.x - feet.x) > 6 || Math.abs(q.z - feet.z) > 6 ||
                                q.y < feet.y - 1 || q.y > feet.y + 12 || !passable(q) || !passable(q.offset(0, 1, 0))) {
                                continue
                            }
                            seen.add(q.toString())
                            queue.push({ p: q, first: first || q })
                        }
                    }
                }
                const horizontal = next && Math.hypot(next.x + 0.5 - bot.entity.position.x, next.z + 0.5 - bot.entity.position.z) > 0.15
                if (horizontal) {
                    await bot.lookAt(new Vec3(next.x + 0.5, bot.entity.position.y + (bot.entity.eyeHeight ?? 1.62), next.z + 0.5), true)
                }
                bot.setControlState('forward', Boolean(horizontal))
                bot.setControlState('jump', true)
                await bot.waitForTicks(1)
            }
        } finally {
            bot.setControlState('jump', false)
            bot.setControlState('forward', false)
        }
    }

    // A raised shield facing the explosion blocks its damage (00.54.52: 11 HP lost while fleeing).
    async braceAgainst (threat) {
        const signal = this.actionAbort?.signal
        this.log.info(`Bracing behind the shield against a ${threat.name} at ${this.bot.entity.position.distanceTo(threat.position).toFixed(1)} blocks.`)
        this.bot.activateItem(true)
        try {
            const deadline = Date.now() + 3000
            while (Date.now() < deadline && threat.isValid !== false && this.bot.entity.position.distanceTo(threat.position) <= 7) {
                this.checkAction(signal)
                await this.bot.lookAt(threat.position.offset(0, 0.9, 0), true)
                await this.bot.waitForTicks(2)
            }
        } finally {
            this.bot.deactivateItem()
        }
    }

    checkAction (signal = this.actionAbort?.signal) {
        if (!this.running || this.paused || this.bot.health <= 0 || signal?.aborted) {
            throw new Error('action cancelled')
        }
    }

    hasEnclosedShelter (center) {
        if (!center || !this.bot.entity.position.floored().equals(center)) {
            return false
        }
        const solid = position => {
            const block = this.bot.blockAt(position, false)
            return block?.boundingBox === 'block' && !['magma_block', 'cactus', 'powder_snow'].includes(block.name) &&
                block.shapes.some(shape => shape.length === 6 && shape.every((x, i) => x === (i < 3 ? 0 : 1)))
        }
        if (!this.isEmptyPlacementBlock(this.bot.blockAt(center, false)) ||
            !this.isEmptyPlacementBlock(this.bot.blockAt(center.offset(0, 1, 0), false)) ||
            !solid(center.offset(0, -1, 0)) || !solid(center.offset(0, 2, 0))) {
            return false
        }
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) {
                    continue
                }
                if (!solid(center.offset(dx, 0, dz)) || !solid(center.offset(dx, 1, dz))) {
                    return false
                }
            }
        }
        return true
    }

    async makeNightSafe () {
        const signal = this.actionAbort?.signal
        this.checkAction(signal)
        if (this.countItems(BUILDING_BLOCKS) < 17) {
            const burrowed = await this.burrow().then(() => true, error => {
                this.log.warn(`Emergency burrow unavailable: ${error.message}`)
                return false
            })
            if (burrowed) {
                return
            }
            this.checkAction(signal)
            const dirt = this.findNearestBlock(name => name === 'dirt' || name === 'cobblestone', 16, { mining: true })
            if (dirt) {
                await this.collectTarget(dirt, dirt, 'shelter blocks')
            } else {
                await this.escapeFrom(this.nearestEntity(HOSTILES))
            }
            this.checkAction(signal)
            return
        }
        const center = this.bot.entity.position.floored()
        const failures = []
        for (let level = 0; level <= 1; level++) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dz === 0) {
                        continue
                    }
                    this.checkAction(signal)
                    await this.placeSurvivalBlock(center.offset(dx, level, dz))
                        .catch(error => failures.push(error.message))
                    this.checkAction(signal)
                }
            }
        }
        const roof = center.offset(0, 2, 0)
        // Obstructions can make any one wall unusable as a seat for the roof.
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (!this.isEmptyPlacementBlock(this.bot.blockAt(roof, false))) {
                break
            }
            const support = roof.offset(dx, 0, dz)
            await this.placeSurvivalBlock(support).catch(error => failures.push(error.message))
            this.checkAction(signal)
            if (this.bot.blockAt(support, false)?.boundingBox === 'block') {
                await this.placeSurvivalBlock(roof).catch(error => failures.push(error.message))
                this.checkAction(signal)
            }
        }
        if (!this.hasEnclosedShelter(center)) {
            this.sheltered = false
            this.shelterCenter = null
            const reason = `shelter enclosure incomplete; ${failures.length} placement errors${failures.length ? `: ${failures.at(-1)}` : ''}`
            await this.burrow().catch(error => {
                throw new Error(`${reason}; burrow fallback failed: ${error.message}`)
            })
            return
        }
        this.shelterCenter = center.clone()
        this.memory.shelter = { x: center.x, y: center.y, z: center.z, dimension: this.bot.game.dimension }
        this.sheltered = true
        this.log.info('Emergency shelter enclosure verified; waiting for daylight.')
        await sleep(1000)
        this.checkAction(signal)
    }

    // Without walling blocks, dig three blocks straight down by hand and plug the top
    // one with a drop: undisturbed ground forms the walls, so placement needs no scaffold.
    async mineFromShelter () {
        const shelter = this.memory.shelter
        const center = this.shelterCenter
        try {
            await this.bot.equip(miningPickaxe(this), 'hand')
            this.checkAction()
            await this.burrow(true)
            await mineTunnel(this, this.bot.entity.position.floored().y - 4)
        } catch (error) {
            if (shelter) {
                shelter.descentFailed = true
            }
            this.checkAction()
            if (center && this.hasEnclosedShelter(center)) {
                this.log.warn(`Shelter mining descent unavailable: ${error.message}; keeping the enclosure closed.`)
                return
            }
            throw error
        }
    }

    async burrow (forMining = false) {
        const signal = this.actionAbort?.signal
        const top = this.bot.entity.position.floored()
        const center = top.offset(0, -3, 0)
        const at = p => this.bot.blockAt(p, false)
        const solid = p => at(p)?.boundingBox === 'block' && !['lava', 'magma_block'].includes(at(p).name)
        const column = [1, 2, 3].map(dy => top.offset(0, -dy, 0))
        const undiggable = column.find(p => {
            const block = at(p)
            return !(block?.boundingBox === 'block' && block.diggable && !PROTECTED_CONTAINERS.has(block.name) &&
                (block.material !== 'mineable/pickaxe' || miningPickaxe(this, block)) &&
                !['sand', 'red_sand', 'gravel', 'suspicious_sand', 'suspicious_gravel'].includes(block.name) &&
                (this.bot.digTime?.(block) ?? 0) <= 8000 &&
                [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].every(([x, y, z]) => !['water', 'lava'].includes(at(p.offset(x, y, z))?.name)))
        })
        const openWall = [0, 1].flatMap(level => [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dz => center.offset(dx, level, dz))))
            .find(p => !p.equals(center) && !p.equals(center.offset(0, 1, 0)) && !solid(p))
        const floor = center.offset(0, -1, 0)
        const problem = undiggable ? `column cell ${undiggable} is ${at(undiggable)?.name ?? 'unloaded'}` :
            openWall ? `wall cell ${openWall} is ${at(openWall)?.name ?? 'unloaded'}` :
                !solid(floor) ? `floor ${floor} is ${at(floor)?.name ?? 'unloaded'}` : !this.bot.registry ? 'no registry' : null
        if (problem) {
            throw new Error(`no hand-diggable enclosed column below: ${problem}`)
        }
        for (const p of column) {
            this.checkAction(signal)
            const block = at(p)
            if (['mineable/pickaxe', 'mineable/shovel'].includes(block.material)) {
                await this.equipStoneDigTool(block)
                this.checkAction(signal)
            }
            await this.bot.dig(block, true)
            await this.bot.waitForTicks(8)
            // An off-centre bot keeps standing on the neighbouring block's edge; step into the hole.
            if (this.bot.entity.position.y > p.y + 0.5) {
                await this.gotoWithTimeout(new goals.GoalBlock(p.x, p.y, p.z), 3000, 'burrow step')
                await this.bot.waitForTicks(4)
            }
        }
        this.checkAction(signal)
        if (!this.bot.entity.position.floored().equals(center)) {
            throw new Error(`burrow descent ended at ${this.positionText()}`)
        }
        await waitUntil(() => this.countItems(BUILDING_BLOCKS) > 0, 2000, 100).catch(() => {})
        await this.placeSurvivalBlock(center.offset(0, 2, 0))
        this.checkAction(signal)
        if ([0, 1].some(dy => at(center.offset(0, dy, 0))?.name === 'water')) {
            await until(this, () => [0, 1].every(dy => this.isEmptyPlacementBlock(at(center.offset(0, dy, 0)))), 5000)
            this.checkAction(signal)
        }
        if (!this.hasEnclosedShelter(center)) {
            throw new Error('burrow enclosure incomplete')
        }
        this.shelterCenter = center.clone()
        this.memory.shelter = { x: center.x, y: center.y, z: center.z, dimension: this.bot.game.dimension, burrowed: true }
        this.sheltered = true
        this.log.info(`Burrow enclosure verified at ${center}; ${forMining ? 'continuing underground' : 'replanning protection'}.`)
    }

    async placeSurvivalBlock (target) {
        const signal = this.actionAbort?.signal
        this.checkAction(signal)
        await clearPlants(this, [target])
        this.checkAction(signal)
        const existing = this.bot.blockAt(target)
        if (!this.isEmptyPlacementBlock(existing) && existing?.name !== 'water') {
            return
        }
        const item = this.bestItem(BUILDING_BLOCKS)
        if (!item) {
            throw new Error('out of shelter blocks')
        }
        // Clicking a furnace or table opens it instead of placing (03.32.42: three refusals on the
        // bot's own furnace); plain supports come first, and an interactive one is used sneaking.
        const interactive = name => PROTECTED_CONTAINERS.has(name) || INTERACTIVE.test(name)
        const references = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]
            .map(([dx, dy, dz]) => ({ face: new Vec3(-dx, -dy, -dz), ref: this.bot.blockAt(target.offset(dx, dy, dz)) }))
            .filter(({ ref }) => ref?.boundingBox === 'block')
            .sort((a, b) => interactive(a.ref.name) - interactive(b.ref.name))
        const choice = references[0]
        if (!choice) {
            throw new Error(`no support for block at ${target}`)
        }
        await this.bot.equip(item, 'hand')
        this.checkAction(signal)
        const sneak = interactive(choice.ref.name)
        if (sneak) {
            this.bot.setControlState('sneak', true)
        }
        try {
            await this.bot.placeBlock(choice.ref, choice.face)
        } finally {
            if (sneak) {
                this.bot.setControlState('sneak', false)
            }
        }
        this.checkAction(signal)
    }

    async breakBlockAt (position) {
        const block = this.bot.blockAt(position)
        if (block && block.name !== 'air' && this.bot.canDigBlock(block)) {
            await this.bot.dig(block, true)
        }
    }

    // Mineflayer matches each recipe variant against one plank type, so mixed planks
    // (5 birch + 1 oak) cannot craft a 6-plank shield; grow the most plentiful type.
    async ensurePlanks (minimum) {
        const plankOf = name => name.replace(/_log$/, '_planks').replace(/_wood$/, '_planks').replace(/_stem$/, '_planks').replace(/_hyphae$/, '_planks')
        for (;;) {
            const counts = {}
            for (const item of this.bot.inventory.items().filter(item => item.name.endsWith('_planks'))) {
                counts[item.name] = (counts[item.name] || 0) + item.count
            }
            if (Math.max(0, ...Object.values(counts)) >= minimum) {
                return
            }
            const logs = this.bot.inventory.items().filter(item => LOG_SUFFIXES.some(suffix => item.name.endsWith(suffix)))
                .sort((a, b) => (counts[plankOf(b.name)] || 0) - (counts[plankOf(a.name)] || 0))
            if (!logs.length) {
                throw new Error('need more logs')
            }
            await this.craftItem(plankOf(logs[0].name), 4, false)
        }
    }

    async ensureItem (name, count, needsTable) {
        const missing = count - this.countItems([name])
        if (missing <= 0) {
            return
        }
        await this.craftItem(name, missing, needsTable)
    }

    async craftItem (name, count, needsTable) {
        const item = this.mcData.itemsByName[name]
        if (!item) {
            throw new Error(`unknown item for ${this.bot.version}: ${name}`)
        }
        let table = null
        if (needsTable) {
            table = await this.getCraftingTable()
        }
        const recipes = this.bot.recipesFor(item.id, null, count, table)
        if (recipes.length === 0) {
            throw new Error(`no available recipe for ${name}`)
        }
        const recipe = recipes[0]
        const perCraft = recipe.result ? recipe.result.count : 1
        const before = this.countItems([name])
        await this.bot.craft(recipe, Math.ceil(count / perCraft), table)
        await sleep(250)
        const after = this.countItems([name])
        if (after <= before) {
            throw new Error(`crafting ${name} completed without producing the item`)
        }
        this.log.info(`Crafted ${name}; inventory now has ${after}.`)
        if (table) {
            await this.reclaimStation(table).catch(error => this.log.warn(`Could not reclaim crafting table: ${error.message}`))
        }
    }

    async getCraftingTable () {
        return this.getStation('crafting_table')
    }

    async getFurnace () {
        return this.getStation('furnace')
    }

    findStation (name, maxDistance = 4) {
        return this.mcData ? this.findNearestBlock(candidate => candidate === name, maxDistance) : null
    }

    async getStation (name) {
        let station = await scanFor(this, () => this.findStation(name, 4))
        if (station) {
            return station
        }
        if (!this.bestItem([name])) {
            throw new Error(`${name.replaceAll('_', ' ')} is missing`)
        }

        const candidates = this.findWorkstationPlacements(5)
        const failures = []
        for (const candidate of candidates.slice(0, 20)) {
            try {
                if (this.bot.entity.position.distanceTo(candidate.target.offset(0.5, 0.5, 0.5)) > 4.2) {
                    await this.bot.pathfinder.goto(new GoalNear(candidate.target.x, candidate.target.y, candidate.target.z, 3))
                }

                station = this.findStation(name, 4)
                if (station) {
                    return station
                }

                const feet = this.bot.entity.position.floored()
                if (candidate.target.equals(feet) || candidate.target.equals(feet.offset(0, 1, 0))) {
                    continue
                }
                const ground = this.bot.blockAt(candidate.target.offset(0, -1, 0))
                const target = this.bot.blockAt(candidate.target)
                if (!ground || !target || ground.boundingBox === 'empty' || !this.isEmptyPlacementBlock(target)) {
                    continue
                }

                const item = this.bestItem([name])
                if (!item) {
                    throw new Error(`${name.replaceAll('_', ' ')} disappeared from inventory`)
                }
                await this.bot.equip(item, 'hand')
                await this.bot.lookAt(ground.position.offset(0.5, 1, 0.5), true)
                try {
                    await this.bot.placeBlock(ground, new Vec3(0, 1, 0))
                } catch (error) {
                    // Some servers acknowledge placement before Mineflayer's promise
                    // settles. Verify the world before treating the exception as fatal.
                    const placedDespiteError = this.bot.blockAt(candidate.target)
                    if (!placedDespiteError || placedDespiteError.name !== name) {
                        throw error
                    }
                }
                station = await waitUntil(() => {
                    const block = this.bot.blockAt(candidate.target)
                    return block && block.name === name ? block : null
                }, 2000, 100)
                this.memory.ownedStations.add(`${this.bot.game.dimension}:${this.targetKey(station)}`)
                this.log.info(`Placed ${name.replaceAll('_', ' ')} at ${candidate.target}.`)
                return station
            } catch (error) {
                failures.push(`${candidate.target}: ${error.message}`)
            }
        }
        const detail = failures.length > 0 ? `; last attempt: ${failures.at(-1)}` : '; no clear supported space within five blocks'
        throw new Error(`could not place ${name.replaceAll('_', ' ')}${detail}`)
    }

    isEmptyPlacementBlock (block) {
        return block && ['air', 'cave_air', 'void_air'].includes(block.name)
    }

    findWorkstationPlacements (maxRadius) {
        const feet = this.bot.entity.position.floored()
        const candidates = []
        const seen = new Set()
        for (let radius = 1; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) {
                        continue
                    }
                    for (let targetY = feet.y + 2; targetY >= feet.y - 5; targetY--) {
                        const target = new Vec3(feet.x + dx, targetY, feet.z + dz)
                        const key = target.toString()
                        if (seen.has(key)) {
                            continue
                        }
                        seen.add(key)
                        const ground = this.bot.blockAt(target.offset(0, -1, 0), false)
                        const space = this.bot.blockAt(target, false)
                        const above = this.bot.blockAt(target.offset(0, 1, 0), false)
                        if (!ground || !space || !above) {
                            continue
                        }
                        if (ground.boundingBox === 'empty' || ['water', 'lava'].includes(ground.name)) {
                            continue
                        }
                        if (!this.isEmptyPlacementBlock(space) || !this.isEmptyPlacementBlock(above)) {
                            continue
                        }
                        const distance = this.bot.entity.position.distanceTo(target.offset(0.5, 0.5, 0.5))
                        candidates.push({ target, distance })
                        break
                    }
                }
            }
        }
        return candidates.sort((a, b) => a.distance - b.distance)
    }

    async reclaimStation (station) {
        const key = `${this.bot.game.dimension}:${this.targetKey(station)}`
        if (!this.memory.ownedStations.has(key)) {
            return
        }
        const current = this.bot.blockAt(station.position)
        if (!current || current.name !== station.name) {
            return
        }
        // The pathfinder's movement rules refuse to break furnaces and chests, so dig directly.
        if (this.bot.entity.position.distanceTo(current.position.offset(0.5, 0.5, 0.5)) > 4) {
            await this.gotoWithTimeout(new GoalNear(current.position.x, current.position.y, current.position.z, 2), 8000, 'workstation approach')
        }
        const feet = this.bot.entity.position.floored()
        if (current.position.x === feet.x && current.position.z === feet.z && current.position.y < feet.y) {
            this.log.info('Leaving the workstation supporting the bot intact.')
            return
        }
        await this.bot.tool?.equipForBlock?.(current, { requireHarvest: true, getFromChest: false }).catch(() => {})
        if (this.actionAbort?.signal.aborted) {
            throw new Error('station reclamation cancelled')
        }
        if (current.material === 'mineable/axe') {
            this.log.debug?.(`Reclaiming ${current.name} with ${this.bot.heldItem?.name || 'bare hands'}.`)
        }
        await this.bot.dig(current, true)
        await this.bot.waitForTicks(6)
        const [drop] = this.visibleDrops(current.position.offset(0.5, 0, 0.5), 3)
        if (drop) {
            const p = drop.position.floored()
            if (safeFooting(this.bot, p)) {
                const guarded = Boolean(this.movements && this.bot.pathfinder)
                if (guarded) { this.bot.pathfinder.setMovements(dryMovements(this.bot)) }
                try {
                    await this.gotoWithTimeout(new GoalNear(p.x, p.y, p.z, 1), 4000, 'workstation pickup').catch(() => {})
                } finally {
                    if (guarded) { this.bot.pathfinder.setMovements(this.movements) }
                }
            } else {
                this.log.info('Leaving workstation drop without a safe dry landing.')
            }
        }
        this.memory.ownedStations.delete(key)
    }

    async explore () {
        if (this.isNight()) {
            return this.makeNightSafe()
        }
        await this.scout(36)
    }

    async unstick () {
        const signal = this.actionAbort?.signal
        const loose = dryMovements(this.bot)
        loose.getMoveDiagonal = () => {}
        if (!this.bot.entity?.isInWater) {
            const water = this.bot.registry.blocksByName.water.id
            loose.blocksToAvoid.add(water)
            loose.blocksCantBreak.add(water)
        }
        this.log.warn(`No route out; scouting supported cardinal steps without bridging; maximum drop=${loose.maxDropDown}.`)
        this.bot.pathfinder.setMovements(loose)
        try {
            await this.scout(16)
            return
        } catch (error) {
            this.log.warn(`Unstick scouting failed: ${error.message}`)
        } finally {
            this.bot.pathfinder.setMovements(this.movements)
        }
        // A failed goto defers its stop and would abort the first dig (F004).
        this.bot.pathfinder.setGoal(null)
        await this.bot.waitForTicks(2)
        this.checkAction(signal)
        const descending = ['gather_diamonds', 'gather_redstone', 'gather_lapis'].includes(this.activeAction || this.lastAction)
        if (descending) {
            this.memory.tunnelFrontier = null
            this.memory.mineDirection = ((this.memory.mineDirection || 0) + 1) % 4
        }
        await mineTunnel(this, Math.floor(this.bot.entity.position.y) + (descending ? -4 : 4))
    }

    async scout (distance, { surfaceOnly = false } = {}) {
        const here = this.bot.entity.position
        const offsets = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4, -3 * Math.PI / 4, Math.PI]
        const distances = [...new Set([distance, Math.max(16, Math.floor(distance * 2 / 3)), 10])]
        const candidates = []
        let order = 0
        for (const candidateDistance of distances) {
            for (const offset of offsets) {
                const angle = this.scoutAngle + offset
                const x = Math.floor(here.x + Math.cos(angle) * candidateDistance)
                const z = Math.floor(here.z + Math.sin(angle) * candidateDistance)
                let landSamples = 0
                let waterSamples = 0
                let unknownSamples = 0
                for (const fraction of [0.25, 0.5, 0.75, 1]) {
                    const sampleX = Math.floor(here.x + Math.cos(angle) * candidateDistance * fraction)
                    const sampleZ = Math.floor(here.z + Math.sin(angle) * candidateDistance * fraction)
                    const terrain = this.classifyTerrainColumn(sampleX, sampleZ, Math.floor(here.y))
                    if (terrain === 'land') {
                        landSamples += 1
                    }
                    else if (terrain === 'water') {
                        waterSamples += 1
                    }
                    else {
                        unknownSamples += 1
                    }
                }
                const visitKey = `${Math.floor(x / 16)},${Math.floor(z / 16)}`
                candidates.push({
                    angle, x, z, distance: candidateDistance, landSamples, waterSamples,
                    unknownSamples, visits: this.memory.scoutVisits.get(visitKey) || 0,
                    visitKey, order: order++
                })
            }
        }

        const selected = chooseLandCandidate(candidates)
        if (!selected) {
            this.scoutAngle += Math.PI / 3
            this.scoutSteps += 1
            throw new Error('no safe land scouting route found; refusing to swim into open water')
        }

        this.log.info(`Land scout selected ${selected.x},${Math.floor(here.y)},${selected.z} ` +
            `(land=${selected.landSamples}, water=${selected.waterSamples}, visited=${selected.visits}).`)
        if (surfaceOnly) {
            if (this.isNight()) {
                throw new Error('surface water exploration is daytime only')
            }
            const walking = dryMovements(this.bot)
            walking.exclusionAreasStep.push(block => block.position && openToSky(this.bot, block.position.offset(0, 1, 0)) ? 0 : 100)
            this.bot.pathfinder.setMovements(walking)
        }
        try {
            // Terrain height at the target is unknown; a fixed-height 3-D goal can sit in air or rock.
            const goal = new goals.GoalNearXZ(selected.x, selected.z, 3)
            await this.gotoWithTimeout(goal, 25000, 'land scouting')
            if (!goal.isEnd(this.bot.entity.position.floored())) {
                throw new Error('No path to the goal! Land scout ended outside its destination.')
            }
            this.memory.scoutVisits.set(selected.visitKey, selected.visits + 1)
            this.scoutAngle = selected.angle + Math.PI / 8
            this.scoutSteps += 1
        } catch (error) {
            this.scoutAngle += Math.PI / 3
            this.scoutSteps += 1
            throw error
        } finally {
            if (surfaceOnly) {
                this.bot.pathfinder.setMovements(this.movements)
            }
        }
    }

    classifyTerrainColumn (x, z, referenceY) {
        const top = Math.min(319, referenceY + 24)
        const bottom = Math.max(-64, referenceY - 32)
        for (let y = top; y >= bottom; y--) {
            const block = this.bot.blockAt(new Vec3(x, y, z), false)
            if (!block || ['air', 'cave_air', 'void_air'].includes(block.name)) {
                continue
            }
            if (block.name === 'water' || block.name === 'lava') {
                return 'water'
            }
            return 'land'
        }
        return 'unknown'
    }

    async randomWalk (distance) {
        const angle = this.rng() * Math.PI * 2
        const here = this.bot.entity.position
        const x = Math.floor(here.x + Math.cos(angle) * distance)
        const z = Math.floor(here.z + Math.sin(angle) * distance)
        await this.bot.pathfinder.goto(new GoalNear(x, Math.floor(here.y), z, 3))
    }

    findNearestBlock (predicate, maxDistance, options = {}) {
        const ids = Object.values(this.mcData.blocksByName)
            .filter(block => predicate(block.name))
            .map(block => block.id)
        if (ids.length === 0) {
            return null
        }
        const search = { matching: ids, maxDistance }
        search.useExtraInfo = block => !this.isBlockedTarget(block) &&
            (!options.filter || options.filter(block)) &&
            (options.sight ? options.sight(block) : blockInView(this.bot, block, options.mining && exposedByDig(this, block)))
        return this.bot.findBlock(search)
    }

    nearestEntity (names, maxDistance = 16) {
        return this.bot.nearestEntity(entity => {
            const name = entity.name
            return entity.isValid && names.has(name) && this.bot.entity.position.distanceTo(entity.position) <= maxDistance &&
                (!PREY.has(name) || !this.isBlockedTarget(entity)) && this.canSee(entity)
        })
    }

    bestFood () {
        return this.bot.inventory.items()
            .filter(item => FOOD_VALUES[item.name])
            .sort((a, b) => FOOD_VALUES[b.name] - FOOD_VALUES[a.name])[0] || null
    }

    foodUnits () {
        return this.bot.inventory.items().reduce((total, item) => total + (FOOD_VALUES[item.name] || 0) * item.count, 0)
    }

    bestItem (priorityNames) {
        const items = this.bot.inventory.items()
        for (const name of priorityNames) {
            const exact = items.find(item => item.name === name)
            if (exact) {
                return exact
            }
            const suffix = items.find(item => item.name.endsWith(`_${name}`))
            if (suffix) {
                return suffix
            }
        }
        return null
    }

    hasItem (name) { return this.countItems([name]) > 0 }
    hasAnyItem (names) { return names.some(name => this.hasItem(name)) }

    countItems (names) {
        const wanted = new Set(names)
        return this.bot.inventory.items().reduce((sum, item) => sum + (wanted.has(item.name) ? item.count : 0), 0)
    }

    countMatching (predicate) {
        return this.bot.inventory.items().reduce((sum, item) => sum + (predicate(item.name) ? item.count : 0), 0)
    }

    configureSafeMovements (movements) {
        for (const name of PROTECTED_CONTAINERS) {
            movements.blocksCantBreak.add(movements.bot.registry.blocksByName[name].id)
        }
        movements.exclusionAreasBreak.push(block => block.material === 'mineable/pickaxe' &&
            !movements.bot.inventory?.items().some(item => item.name.endsWith('_pickaxe') && block.canHarvest(item.type)) ? 100 : 0)
        movements.allow1by1towers = false
        movements.allowParkour = false
        movements.scafoldingBlocks = []
        movements.maxDropDown = SAFE_PATHFINDER_DROP
        movements.canDig = true
        movements.dontCreateFlow = true
        // Never let generic A* mine the block directly below a route node. It can
        // walk down adjacent steps, but vertical support removal is reserved for
        // descendSafely(), which verifies every landing before digging.
        movements.getMoveDown = () => {}
        // Prefer walking around water. Water remains traversable for emergencies,
        // but ordinary scouting will not select an open-ocean destination.
        movements.liquidCost = 50
        movements.infiniteLiquidDropdownDistance = false
    }

    inventorySummary () {
        const names = ['crafting_table', 'stick', 'wooden_pickaxe', 'wooden_sword', 'cobblestone', 'stone_pickaxe', 'stone_shovel', 'furnace', 'coal', 'raw_iron', 'iron_ingot', 'iron_pickaxe',
            'stone_axe', 'iron_sword', 'diamond', 'diamond_pickaxe', 'diamond_sword', 'bucket', 'water_bucket', 'lava_bucket',
            'obsidian', 'flint_and_steel']
        const parts = []
        const logs = this.countMatching(name => LOG_SUFFIXES.some(suffix => name.endsWith(suffix)))
        const planks = this.countMatching(name => name.endsWith('_planks'))
        if (logs) {
            parts.push(`logs=${logs}`)
        }
        if (planks) {
            parts.push(`planks=${planks}`)
        }
        for (const name of names) {
            const count = this.countItems([name])
            if (count) {
                parts.push(`${name}=${count}`)
            }
        }
        return parts.length > 0 ? parts.join(' ') : 'inventory=empty'
    }

    isNight () {
        const time = this.bot.time.timeOfDay
        return this.bot.game.dimension === 'overworld' && time >= 12500 && time <= 23500
    }

    positionText () {
        if (!this.bot.entity) {
            return 'unknown'
        }
        const p = this.bot.entity.position.floored()
        return `${p.x},${p.y},${p.z}`
    }

    cancelCurrentTask (reason) {
        this.log.warn(`Cancelling current task: ${reason}`)
        // Lava costs ~2.5 HP per half second; the 1.5 s failure back-off cost death #8 (17:30:23Z).
        this.urgentReplan = /crowd|creeper|attacked|critical health|night damage|sheltered|lava|suffocat|air/.test(reason)
        this.actionAbort?.abort(reason)
        if (this.activeCollection && /(is stuck|timed out|memory guard)/.test(reason)) {
            this.rememberBlockedTarget(
                this.activeCollection.anchor,
                this.activeCollection.label,
                new Error(reason)
            )
        }
        this.clearCurrentTask()
    }

    clearCurrentTask () {
        this.actionAbort?.abort()
        this.bot.clearControlStates?.()
        this.bot.deactivateItem?.()
        if (this.bot.currentWindow) {
            this.bot.closeWindow(this.bot.currentWindow).catch(() => {})
        }
        if (this.bot.pathfinder && this.bot.pathfinder.setGoal) {
            this.bot.pathfinder.setGoal(null)
        }
        if (this.bot.targetDigBlock && this.bot.stopDigging) {
            try {
                this.bot.stopDigging()
            } catch (_) {}
        }
    }

    onChat (username, message) {
        if (!message.startsWith('!')) {
            return
        }
        if (this.owner && username !== this.owner) {
            return
        }
        if (username === this.bot.username) {
            return
        }

        if (message === '!status') {
            const goal = nextAdvancement(this.observe())
            this.bot.chat(`${this.lastAction}; target ${goal.title}; hp ${this.bot.health.toFixed(0)}, food ${this.bot.food}, at ${this.positionText()}`)
        } else if (message === '!pause') {
            this.paused = true
            this.memory.paused = true
            this.cancelCurrentTask(`paused by ${username}`)
            this.bot.chat('Paused.')
        } else if (message === '!inventory' || message === '!inv') {
            const slots = this.bot.inventory.slots
            const worn = { head: slots[5], torso: slots[6], legs: slots[7], feet: slots[8], offhand: slots[45] }
            for (const line of inventoryReport(this.bot.inventory.items(), worn)) {
                this.bot.chat(line)
            }
        } else if (message === '!advancements') {
            const completed = this.advancements.summary()
            this.bot.chat(`${completed.length} confirmed: ${completed.map(id => id.split('/').at(-1)).join(', ') || 'none yet'}`)
        } else if (message === '!redstone') {
            this.memory.redstoneRequested = true
            this.bot.chat('Piston demo queued after the advancement route. Return me to the Overworld afterward.')
        } else if (message === '!resume') {
            this.followPlayer = null
            this.memory.followPlayer = null
            this.memory.paused = false
            this.memory.disposalFailures = 0
            this.clearCurrentTask()
            this.paused = false
            this.bot.chat('Resumed.')
        } else if (message === '!come') {
            const player = this.bot.players[username]
            if (player && player.entity) {
                this.followPlayer = username
                this.memory.followPlayer = username
                this.memory.paused = false
                this.paused = false
                this.cancelCurrentTask(`following ${username}`)
                this.bot.pathfinder.setGoal(new GoalFollow(player.entity, 2), true)
            }
        }
        this.onState(this.observe(), this.lastAction)
    }

    stop () {
        this.running = false
        clearTimeout(this.loopTimer)
        clearInterval(this.memoryGuardTimer)
        this.cancelCurrentTask('shutting down')
    }
}

module.exports = {
    SurvivalController, HOSTILES, PREY, FOOD_VALUES, actionMadeProgress, smeltJobState, updateHome,
    shouldRelocateAfterStationFailure, mobilityRecoveryKind,
    pathfinderDropLimitForLanding, SAFE_PATHFINDER_DROP, kite,
    heapPressureExceeded, PATH_SEARCH_RADIUS, HEAP_GUARD_BYTES, coveredAbove
}
