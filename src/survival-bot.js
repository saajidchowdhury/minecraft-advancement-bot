'use strict'

const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { plugin: collectBlockPlugin } = require('mineflayer-collectblock')
const { Vec3 } = require('vec3')
const { createRng } = require('./random')
const { Actions, chooseAction } = require('./decision-engine')
const { RECIPES, nextAdvancement } = require('./advancement-plan')
const { chooseLandCandidate, isIsolatedPillar } = require('./terrain-scout')
const { updateNightState, retreatForNight } = require('./night-policy')
const { prepareBed, huntAtNight, sleepSafely, leaveShelter, clearPlants, wakeWithOwner } = require('./night-skills')
const { AdvancementTracker } = require('./advancement-tracker')
const { exploreCave, collectOpportunity, findPriorityDiamond } = require('./cave-exploration')
const { performProgression, redstonePlan, mineTunnel, until, climbStep, armorUpgrades } = require('./progression-skills')

const { GoalNear, GoalFollow } = goals

const HOSTILES = new Set([
    'zombie', 'husk', 'drowned', 'skeleton', 'stray', 'creeper', 'spider',
    'cave_spider', 'witch', 'pillager', 'vindicator', 'evoker', 'ravager',
    'slime', 'magma_cube', 'phantom', 'guardian', 'elder_guardian',
    'warden', 'blaze', 'ghast', 'piglin_brute', 'hoglin', 'zoglin', 'wither_skeleton'
])

const PREY = new Set(['cow', 'pig', 'sheep', 'chicken', 'rabbit'])

const FOOD_VALUES = {
    cooked_beef: 8, cooked_porkchop: 8, cooked_mutton: 6, cooked_chicken: 6,
    cooked_rabbit: 5, bread: 5, baked_potato: 5, golden_carrot: 6,
    beef: 3, porkchop: 3, mutton: 2, chicken: 2, rabbit: 3,
    apple: 4, carrot: 3, potato: 1, sweet_berries: 2, glow_berries: 2,
    melon_slice: 2, dried_kelp: 1, mushroom_stew: 6, beetroot_soup: 6
}

const LOG_SUFFIXES = ['_log', '_stem', '_wood', '_hyphae']
const CREEPERS = new Set(['creeper'])
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
const ACTION_TIMEOUT_MS = Object.freeze({
    [Actions.ESCAPE]: 30000,
    [Actions.DESCEND]: 30000,
    [Actions.ASCEND]: 90000,
    [Actions.RECOVER]: 90000,
    [Actions.FIGHT]: 30000,
    [Actions.EAT]: 15000,
    [Actions.WOOD]: 90000,
    [Actions.CRAFT_TABLE]: 30000,
    [Actions.CRAFT_WOODEN_PICKAXE]: 30000,
    [Actions.CRAFT_WOODEN_SWORD]: 30000,
    [Actions.STONE]: 90000,
    [Actions.CRAFT_STONE_PICKAXE]: 30000,
    [Actions.CRAFT_FURNACE]: 30000,
    [Actions.FOOD]: 60000,
    [Actions.COAL]: 90000,
    [Actions.IRON]: 90000,
    [Actions.SMELT_IRON]: 60000,
    [Actions.CRAFT_IRON_PICKAXE]: 30000,
    smelt_charcoal: 45000, craft_progression: 45000, equip_armor: 10000, equip_shield: 10000,
    fill_water_bucket: 90000, fill_lava_bucket: 90000, gather_diamonds: 90000, gather_obsidian: 90000,
    gather_flint: 60000, gather_redstone: 90000, enter_nether: 180000,
    clear_inventory: 30000, mine_diamond: 45000, build_redstone: 90000, return_surface: 60000, wait: 10000,
    [Actions.SHELTER]: 60000,
    wake: 10000, hunt_night: 45000, sleep: 30000, prepare_bed: 45000, prepare_night_weapon: 30000, leave_shelter: 20000,
    [Actions.EXPLORE]: 60000
})
const STATIONARY_ACTIONS = new Set([
    Actions.DESCEND,
    Actions.ASCEND,
    'wake', 'sleep', 'prepare_bed', 'prepare_night_weapon', 'leave_shelter',
    Actions.CRAFT_TABLE, Actions.CRAFT_WOODEN_PICKAXE, Actions.CRAFT_WOODEN_SWORD, Actions.CRAFT_STONE_PICKAXE,
    Actions.CRAFT_FURNACE, Actions.SMELT_IRON, Actions.CRAFT_IRON_PICKAXE,
    'clear_inventory', 'smelt_charcoal', 'craft_progression', 'equip_armor', 'equip_shield', 'enter_nether', 'build_redstone', 'wait', Actions.SHELTER
])

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
    const progressed = {
        [Actions.WOOD]: after.logs > before.logs || after.planks > before.planks,
        [Actions.STONE]: after.cobblestone > before.cobblestone,
        [Actions.COAL]: after.coal > before.coal,
        [Actions.IRON]: after.rawIron > before.rawIron,
        [Actions.FOOD]: after.foodUnits > before.foodUnits,
        [Actions.DESCEND]: moved,
        [Actions.ASCEND]: moved,
        [Actions.RECOVER]: !after.recoveryAvailable,
        [Actions.EXPLORE]: moved
    }
    return !Object.hasOwn(progressed, action) || progressed[action] || moved
}

class SurvivalController {
    constructor (bot, options = {}) {
        this.bot = bot
        this.hostileNames = HOSTILES
        this.owner = options.owner || ''
        this.rng = createRng(options.seed ?? 1)
        this.probeSpacing = options.probeSpacing ?? 8
        this.onState = options.onState || (() => {})
        this.log = options.log || console
        this.memory = options.memory || {}
        if (!(this.memory.blockedTargets instanceof Map)) {
            this.memory.blockedTargets = new Map()
        }
        if (!(this.memory.scoutVisits instanceof Map)) {
            this.memory.scoutVisits = new Map()
        }
        this.advancements = new AdvancementTracker((id, initial) => {
            this.log.info(`${initial ? 'Already completed' : 'Advancement earned'}: ${id}`)
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
            const position = this.bot.entity && this.bot.entity.position
            if (position) {
                const previous = this.memory.lastDeath
                const sameRecovery = previous && previous.dimension === this.bot.game.dimension &&
                    Date.now() - previous.diedAt < RECOVERY_WINDOW_MS &&
                    Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z) <= 16
                this.memory.lastDeath = {
                    x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z),
                    diedAt: sameRecovery ? previous.diedAt : Date.now(),
                    attempts: sameRecovery ? previous.attempts : 0, dimension: this.bot.game.dimension
                }
                this.log.warn(`Remembered death position ${this.memory.lastDeath.x},${this.memory.lastDeath.y},${this.memory.lastDeath.z}; dropped items will be prioritized after respawn.`)
            }
            this.log.warn('Bot died; it will resume after respawning.')
            this.sheltered = false
            this.shelterCenter = null
            this.cancelCurrentTask('death')
        })
        let previousHealth = this.bot.health
        this.bot.on('health', () => {
            const action = this.activeAction || this.lastAction
            const tookDamage = Number.isFinite(previousHealth) && previousHealth - this.bot.health > 0.01
            if (this.running && tookDamage) {
                const threats = Object.values(this.bot.entities || {}).filter(entity => entity.isValid && HOSTILES.has(entity.name) &&
                    this.bot.entity.position.distanceTo(entity.position) <= 12)
                    .map(entity => `${entity.name}:${this.bot.entity.position.distanceTo(entity.position).toFixed(1)}`)
                this.log.warn(`Damage: hp=${previousHealth.toFixed(2)}->${this.bot.health.toFixed(2)}, action=${action}, ` +
                    `sheltered=${this.sheltered}, nearby threats=${threats.join(',') || 'none'}, at ${this.positionText()}.`)
                if (this.memory && this.bot.game?.dimension === 'overworld' && this.isNight?.() &&
                    this.bot.entity.position.y >= (this.home?.y || 64) - 3 &&
                    (previousHealth - this.bot.health >= 4 || this.bot.health <= 16)) {
                    retreatForNight(this, 'surface damage or reduced health')
                    if (this.busy && ![Actions.ESCAPE, Actions.SHELTER].includes(action)) {
                        this.cancelCurrentTask('night damage retreat')
                    }
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
            if (this.bot.health <= 6 && this.busy && action !== Actions.ESCAPE &&
                (tookDamage || ![Actions.EAT, Actions.SHELTER].includes(action)) && !this.actionAbort?.signal.aborted) {
                this.cancelCurrentTask('critical health')
            }
        })
        this.bot.on('entityMoved', entity => {
            if (entity.name !== 'creeper' || !this.running || !this.busy || this.activeAction === Actions.ESCAPE ||
                this.actionAbort?.signal.aborted || !this.bot.entity ||
                this.bot.entity.position.distanceTo(entity.position) > 6 || !this.canSee(entity)) {
                return
            }
            this.log.warn(`Creeper visible at ${this.bot.entity.position.distanceTo(entity.position).toFixed(1)} blocks; interrupting ${this.activeAction}.`)
            this.cancelCurrentTask('creeper approaching')
        })
        this.bot.on('chat', (username, message) => this.onChat(username, message))
    }

    async onSpawn () {
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
        if (!this.memory.home) {
            const spawn = this.bot.entity.position.floored()
            this.memory.home = { x: spawn.x, y: spawn.y, z: spawn.z }
        }
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

        if (this.followPlayer) {
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
            this.log.info(`Action: ${action} | hp=${state.health.toFixed(1)} food=${state.food} | ${this.inventorySummary()} | at ${this.positionText()}`)
            this.onState(state, action)
            const actionStart = this.bot.entity.position.clone()
            await this.performWithTimeout(action, state)
            const after = this.observe()
            this.onState(after, action)
            this.verifyActionProgress(action, state, after, actionStart)
            const next = nextAdvancement(after)
            if (next.id !== advancement.id) {
                this.log.info(`Next objective: ${next.title}. Completion is confirmed separately by the server.`)
            }
            this.failures.set(action, 0)
        } catch (error) {
            const count = (this.failures.get(action) || 0) + 1
            this.failures.set(action, count)
            const message = error && error.message ? error.message : String(error)
            this.log.warn(`${action} failed (${count}): ${message}`)
            // A failed collect/path can leave a direct Mineflayer dig in flight even
            // though its promise already rejected. Stop all action ownership before
            // starting a staircase, descent, or relocation that uses the same bot.
            this.clearCurrentTask()
            await sleep(100)
            if (!this.running || this.paused || this.followPlayer || this.bot.health <= 0) {
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
            if (count >= 3 && action !== 'hunt_night' && !STATIONARY_ACTIONS.has(action)) {
                await this.scout(12).catch(() => {})
            }
        } finally {
            this.busy = false
            if (this.running) {
                this.scheduleLoop()
            }
        }
    }

    observe () {
        if (!this.isNight() && !this.shelterCenter) {
            this.sheltered = false
        }
        if (this.sheltered && !this.bot.isSleeping &&
            (!this.shelterCenter || !this.hasEnclosedShelter(this.shelterCenter))) {
            this.sheltered = false
            this.shelterCenter = null
            this.log.warn('Shelter enclosure is no longer intact; replanning protection.')
        }
        const hostile = this.nearestEntity(HOSTILES, 24)
        const creeper = this.nearestEntity(CREEPERS, 8)
        const creeperVisible = Boolean(creeper && this.canSee(creeper))
        const lastDeath = this.memory.lastDeath
        const recoveryAge = lastDeath ? Date.now() - lastDeath.diedAt : Infinity
        const hasTableNow = this.hasItem('crafting_table') || Boolean(this.findStation('crafting_table', 4))
        const hasSwordNow = this.hasAnyItem(['wooden_sword', 'stone_sword', 'iron_sword', 'diamond_sword', 'netherite_sword'])
        const hasStonePickNow = this.hasAnyItem(['stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'])
        const hasIronPickNow = this.hasAnyItem(['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'])
        const hasWoodPickNow = this.hasItem('wooden_pickaxe') || hasStonePickNow
        const hasFurnaceNow = this.hasItem('furnace') || Boolean(this.findStation('furnace', 4))
        const ironIngots = this.countItems(['iron_ingot'])
        const items = Object.fromEntries(this.bot.inventory.items().map(item => [item.name, item.count]))
        const torso = this.bot.inventory.slots[6]
        const offhand = this.bot.inventory.slots[45]
        const armorNames = ['iron_chestplate', 'diamond_chestplate', 'netherite_chestplate']
        const armorEquipped = Boolean(torso && armorNames.includes(torso.name))
        const shieldEquipped = offhand?.name === 'shield'
        const state = {
            health: this.bot.health,
            food: this.bot.food,
            hostile,
            hostileDistance: hostile ? this.bot.entity.position.distanceTo(hostile.position) : Infinity,
            creeper: creeperVisible ? creeper : null,
            creeperDistance: creeperVisible ? this.bot.entity.position.distanceTo(creeper.position) : Infinity,
            hasWeapon: Boolean(this.bestItem(['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'])),
            hasFood: Boolean(this.bestFood()),
            isNight: this.isNight(),
            sheltered: this.sheltered,
            needsShelterExit: Boolean(this.shelterCenter && !this.isNight()),
            shaftTrapped: this.detectVerticalShaft(),
            elevationTrapped: Boolean(this.detectElevationTrap()),
            // Without a pickaxe a drop far above or below cannot be reached in time; rebuild instead.
            recoveryAvailable: Boolean(lastDeath && lastDeath.dimension === this.bot.game.dimension && recoveryAge < RECOVERY_WINDOW_MS && lastDeath.attempts < 3 &&
                (hasWoodPickNow || Math.abs(lastDeath.y - this.bot.entity.position.y) <= 12)),
            recoverySecondsLeft: lastDeath ? Math.max(0, Math.floor((RECOVERY_WINDOW_MS - recoveryAge) / 1000)) : 0,
            logs: this.countMatching(name => LOG_SUFFIXES.some(suffix => name.endsWith(suffix))),
            planks: this.countMatching(name => name.endsWith('_planks')),
            sticks: this.countItems(['stick']),
            hasCraftingTable: hasTableNow,
            hasWoodenPickaxe: hasWoodPickNow,
            hasEarlySword: hasSwordNow,
            cobblestone: this.countItems(['cobblestone', 'cobbled_deepslate']),
            hasStonePickaxe: hasStonePickNow,
            hasFurnace: hasFurnaceNow,
            foodUnits: this.foodUnits(),
            coal: this.countItems(['coal', 'charcoal']),
            pendingSmelt: Boolean(this.memory.pendingSmelt),
            hasSmeltingFuel: this.countItems(['coal', 'charcoal']) > 0,
            rawIron: this.countItems(['raw_iron']),
            ironIngots,
            hasIronPickaxe: hasIronPickNow,
            hasStoneUtilityPickaxe: this.hasItem('stone_pickaxe'),
            hasDiamondPickaxe: this.hasAnyItem(['diamond_pickaxe', 'netherite_pickaxe']),
            hasIronArmor: armorEquipped || this.hasAnyItem(armorNames), armorEquipped,
            hasShield: shieldEquipped || this.hasItem('shield'), shieldEquipped,
            hasBucket: this.hasAnyItem(['bucket', 'lava_bucket']),
            hasEmptyBucket: this.hasItem('bucket'), hasWaterBucket: this.hasItem('water_bucket'), hasLavaBucket: this.hasItem('lava_bucket'),
            hasFlintAndSteel: this.hasItem('flint_and_steel'),
            diamonds: this.countItems(['diamond']), obsidian: this.countItems(['obsidian']),
            redstone: this.countItems(['redstone']), flint: this.countItems(['flint']),
            completedAdvancements: this.advancements.completed,
            dimension: this.bot.game.dimension, items,
            inventoryFull: this.bot.inventory.emptySlotCount() <= 4 && !(this.memory.disposalBackoffUntil > Date.now()),
            surfaceY: this.home?.y || 64, y: this.bot.entity.position.y,
            underground: this.bot.entity.position.y < (this.home?.y || 64) - 3 && !(this.bot.blockAt(this.bot.entity.position.offset(0, 1, 0))?.skyLight >= 12),
            portalInProgress: Boolean(this.memory.portalOrigin),
            redstoneInProgress: Boolean(this.memory.redstoneOrigin),
            redstoneRequested: Boolean(this.memory.redstoneRequested)
        }
        state.gear = new Set([...this.bot.inventory.items(), ...[5, 6, 7, 8, 45].map(slot => this.bot.inventory.slots[slot])]
            .filter(Boolean).map(item => item.name))
        state.armorUpgrade = armorUpgrades(this.bot).length > 0
        try {
            state.diamondInView = Boolean(this.mcData && findPriorityDiamond(this))
        } catch (error) {
            state.diamondInView = false
            this.log.warn(`Diamond search failed; ignoring it this cycle: ${error.message}`)
        }
        if (state.redstoneRequested && nextAdvancement(state).action === 'wait' && state.dimension === 'overworld') {
            state.sideGoal = redstonePlan(state)
        }
        return updateNightState(this, state)
    }

    async perform (action, state) {
        switch (action) {
            case 'hunt_night': return huntAtNight(this, state)
            case 'wake': return wakeWithOwner(this)
            case 'sleep': return sleepSafely(this, state)
            case 'prepare_bed': return prepareBed(this, state.bedWool)
            case 'prepare_night_weapon': return performProgression(this, 'craft_progression', { sideGoal: { item: 'stone_sword' } })
            case 'leave_shelter': return leaveShelter(this)
            case Actions.ESCAPE: return state.creeperDistance <= 6 ? this.avoidCreeper(state.creeper) : this.escapeFrom(state.hostile)
            case Actions.DESCEND: return this.descendSafely()
            case Actions.ASCEND: return this.escapeVerticalShaft()
            case Actions.RECOVER: return this.recoverItems()
            case Actions.FIGHT: return this.fight(state.hostile)
            case Actions.EAT: return this.eat()
            case Actions.SHELTER: return this.makeNightSafe()
            case Actions.WOOD: return this.gatherWood()
            case Actions.CRAFT_TABLE: return this.craftTable()
            case Actions.CRAFT_WOODEN_PICKAXE: return this.craftWoodenPickaxe()
            case Actions.CRAFT_WOODEN_SWORD: return this.craftWoodenSword()
            case Actions.STONE: return this.gatherStone()
            case Actions.CRAFT_STONE_PICKAXE: return this.craftStonePickaxe()
            case Actions.CRAFT_FURNACE: return this.craftFurnace()
            case Actions.FOOD: return this.gatherFood()
            case Actions.COAL: return this.gatherOre(['coal_ore', 'deepslate_coal_ore'], 32)
            case Actions.IRON: return this.gatherOre(['iron_ore', 'deepslate_iron_ore'], 32)
            case Actions.SMELT_IRON: return this.smeltIron()
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
                        if (this.bot.targetDigBlock) {
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
            return await Promise.race(attempts)
        } finally {
            clearTimeout(timeout)
            clearInterval(movementWatchdog)
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
        const drops = Object.values(this.bot.entities).filter(entity =>
            entity && entity.isValid && entity.name === 'item' &&
            entity.position.distanceTo(this.bot.entity.position) <= 16)
        if (drops.length > 0) {
            await this.collectTarget(drops, null, 'death drops')
            await sleep(500)
        }
        this.log.info(`Death-site recovery complete; collected ${drops.length} nearby item stack${drops.length === 1 ? '' : 's'}.`)
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
        const ranked = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .map(([dx, dz]) => ({ dx, dz, score: this.stairDirectionScore(start, dx, dz, 8) }))
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
                if (['water', 'lava', 'bedrock'].includes(block.name) || !this.bot.canDigBlock(block)) {
                    throw new Error(`unsafe staircase block ${block.name} at ${block.position}`)
                }
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
                // A shallow pit ends at its rim: open, supported level ground beyond the last step is an exit.
                const level = targetFeet.offset(0, -1, 0)
                const open = [level, level.offset(0, 1, 0)].every(p => this.bot.blockAt(p, false)?.boundingBox === 'empty')
                return step > 1 && open && this.bot.blockAt(level.offset(0, -1, 0), false)?.boundingBox === 'block' ? score : Infinity
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
            this.bot.clearControlStates()
            this.log.info(`Safely descending from isolated ${trap.support.name} pillar at ${trap.support.position}.`)
            await this.bot.dig(trap.support, true)
            await waitUntil(() => this.bot.entity.position.y < previousY - 0.6, 4000, 100)
            await sleep(250)
            levels += 1
        }
        throw new Error('safe pillar descent exceeded eight blocks')
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
        const block = this.findNearestBlock(name =>
            LOG_SUFFIXES.some(suffix => name.endsWith(suffix)) && !name.includes('stripped_'), 48, { visible: true })
        if (!block) {
            return this.scout(36)
        }
        const trunk = this.bot.collectBlock.findFromVein(block, 3, 6, 1)
        await this.collectTarget(trunk.length > 0 ? trunk : block, block, 'tree')
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

    async craftWoodenSword () {
        if (this.countItems(['stick']) < 1) {
            await this.ensurePlanks(4)
            await this.ensureItem('stick', 4, false)
        }
        await this.ensurePlanks(2)
        await this.ensureItem('wooden_sword', 1, true)
    }

    async gatherStone () {
        const feet = this.bot.entity.position.floored()
        const block = this.findNearestBlock(name =>
            ['stone', 'cobblestone', 'deepslate', 'cobbled_deepslate'].includes(name), 24, {
            visible: true,
            filter: candidate => candidate.position.x !== feet.x || candidate.position.z !== feet.z
        })
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
    }

    async gatherFood () {
        const berry = this.findNearestBlock(name => name === 'sweet_berry_bush', 32)
        if (berry) {
            await this.collectTarget(berry, berry, 'berries')
            return
        }
        const animal = this.nearestEntity(PREY, 48)
        if (animal) {
            return this.fight(animal, true)
        }
        await this.scout(28)
    }

    async gatherOre (names, radius) {
        const wanted = new Set(names)
        const feet = this.bot.entity.position.floored()
        const block = this.findNearestBlock(name => wanted.has(name), radius, {
            visible: true,
            filter: candidate => candidate.position.x !== feet.x || candidate.position.z !== feet.z
        })
        if (!block) {
            if (await collectOpportunity(this, names) || await exploreCave(this, names.includes('iron_ore') ? 16 : feet.y)) {
                return
            }
            const nearby = this.findNearestBlock(name => wanted.has(name), 12, {
                filter: candidate => candidate.position.y <= feet.y && candidate.position.y >= feet.y - 4
            })
            this.log.debug(`Ore search: ${names[0]}: nearest=${nearby ? nearby.position : 'none'}; exposed target=none; held=${this.bot.heldItem?.name}`)
            return mineTunnel(this, nearby ? nearby.position.y : (names.includes('iron_ore') ? 16 : feet.y), nearby?.position)
        }
        await this.collectTarget(block, block, block.name)
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
                    if (entry.isValid) {
                        const p = entry.position.floored()
                        await this.gotoWithTimeout(new goals.GoalBlock(p.x, p.y, p.z), 8000, 'item pickup')
                        await sleep(500)
                    }
                    continue
                }
                const block = this.bot.blockAt(entry.position)
                if (!block || block.type !== entry.type || block.boundingBox === 'empty') {
                    continue
                }
                if (!this.bot.canDigBlock(block) || !this.bot.canSeeBlock(block)) {
                    await this.gotoWithTimeout(new goals.GoalLookAtBlock(block.position, this.bot.world), 10000, 'resource approach')
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
                await this.bot.tool.equipForBlock(block, { requireHarvest: true, getFromChest: false })
                if (signal?.aborted) {
                    throw new Error('collection cancelled')
                }
                if (!block.canHarvest(this.bot.heldItem?.type)) {
                    throw new Error(`missing harvesting tool for ${block.name}`)
                }
                await this.bot.dig(block, true)
                await sleep(600)
                if (signal?.aborted) {
                    throw new Error('collection cancelled')
                }
                const drops = Object.values(this.bot.entities).filter(e => e.isValid && e.name === 'item' &&
                    e.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 3)
                for (const drop of drops) {
                    if (signal?.aborted) {
                        throw new Error('collection cancelled')
                    }
                    const p = drop.position.floored()
                    await this.gotoWithTimeout(new goals.GoalBlock(p.x, p.y, p.z), 8000, 'mined item pickup')
                }
                await sleep(300)
            }
        } catch (error) {
            this.rememberBlockedTarget(anchor, label, error)
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

    async smeltIron () {
        const furnaceBlock = await this.getFurnace()
        const furnace = await this.bot.openFurnace(furnaceBlock)
        this.memory.pendingSmelt = true
        let completed = false
        try {
            if (furnace.outputItem()?.name === 'iron_ingot') {
                await furnace.takeOutput()
            }
            let inputCount = furnace.inputItem()?.count || 0
            if (furnace.inputItem() && furnace.inputItem().name !== 'raw_iron') {
                throw new Error(`furnace contains unexpected input: ${furnace.inputItem().name}`)
            }
            if (!inputCount) {
                const rawIron = this.bestItem(['raw_iron'])
                if (!rawIron) {
                    completed = true
                    return
                }
                const wanted = RECIPES[nextAdvancement(this.observe()).item]?.ironIngots || 3
                inputCount = Math.min(rawIron.count, 3, Math.max(1, wanted - this.countItems(['iron_ingot'])))
                await furnace.putInput(rawIron.type, rawIron.metadata, inputCount)
            }
            if (!furnace.fuelItem() && (!furnace.fuel || furnace.fuel <= 0)) {
                const fuel = this.bestItem(['coal', 'charcoal'])
                if (!fuel) {
                    throw new Error('coal or charcoal is missing')
                }
                await furnace.putFuel(fuel.type, fuel.metadata, Math.ceil(inputCount / 8))
            }
            await until(this, () => furnace.outputItem()?.name === 'iron_ingot' && furnace.outputItem().count >= inputCount,
                inputCount * 12000 + 5000)
            await furnace.takeOutput()
            if (furnace.fuelItem()) {
                await furnace.takeFuel()
            }
            completed = true
        } finally {
            await this.bot.closeWindow(furnace).catch(() => {})
            if (completed) {
                this.memory.pendingSmelt = false
            }
            if (completed && this.running && !this.paused && !this.actionAbort?.signal.aborted) {
                await this.reclaimStation(furnaceBlock).catch(error => this.log.warn(`Could not reclaim furnace: ${error.message}`))
            }
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

    async fight (entity, hunt = false, guard = null) {
        const signal = this.actionAbort?.signal
        this.checkAction(signal)
        if (!entity || !entity.isValid) {
            throw new Error('target disappeared')
        }
        const weapon = this.bestItem(['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'])
        if (weapon) {
            await this.bot.equip(weapon, 'hand')
            this.checkAction(signal)
        }
        const deadline = Date.now() + 20000
        let following = false
        try {
            while (entity.isValid && Date.now() < deadline) {
                this.checkAction(signal)
                const reason = guard?.()
                if (reason) {
                    throw new Error(reason)
                }
                if (!hunt && this.bot.health <= 8) {
                    throw new Error('combat health too low; replanning escape')
                }
                const distance = this.bot.entity.position.distanceTo(entity.position)
                if (distance > 3.1) {
                    if (!following) {
                        this.bot.pathfinder.setGoal(new GoalFollow(entity, 2), true)
                        following = true
                    }
                    await sleep(300)
                } else {
                    this.bot.pathfinder.setGoal(null)
                    following = false
                    await this.bot.lookAt(entity.position.offset(0, Math.min(entity.height || 1, 1.4), 0), true)
                    this.checkAction(signal)
                    if (this.bot.inventory?.slots[45]?.name === 'shield' && (!hunt || guard)) {
                        this.bot.activateItem(true)
                        await sleep(350)
                        this.bot.deactivateItem()
                        this.checkAction(signal)
                        const changed = guard?.()
                        if (changed) {
                            throw new Error(changed)
                        }
                    }
                    if (!entity.isValid) {
                        break
                    }
                    this.bot.attack(entity)
                    await sleep(650)
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
                const drops = Object.values(this.bot.entities || {}).filter(drop => drop.isValid && drop.name === 'item' &&
                    drop.position.distanceTo(entity.position) <= 4)
                if (drops.length > 0) {
                    await this.collectTarget(drops, null, 'hunting drops')
                }
            }
        } finally {
            this.bot.pathfinder.setGoal(null)
            this.bot.deactivateItem?.()
        }
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
        await this.bot.pathfinder.goto(new GoalNear(x, Math.floor(here.y), z, 3))
    }

    canSee (entity) {
        const eye = this.bot.entity.position.offset(0, 1.62, 0)
        const target = entity.position.offset(0, 1.2, 0)
        const range = eye.distanceTo(target)
        return range < 0.01 || !this.bot.world.raycast(eye, target.minus(eye).scaled(1 / range), range)
    }

    // A creeper only swells while it sees its target, and outrunning it while digging
    // rarely works underground. Seal a narrow passage facing it, otherwise flee.
    async avoidCreeper (creeper) {
        const signal = this.actionAbort?.signal
        const feet = this.bot.entity.position.floored()
        const toward = creeper.position.minus(this.bot.entity.position)
        const openings = []
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (dx * toward.x + dz * toward.z <= 0) {
                continue
            }
            for (const dy of [0, 1, 2]) {
                const cell = feet.offset(dx, dy, dz)
                if (this.isEmptyPlacementBlock(this.bot.blockAt(cell, false)) && !creeper.position.floored().equals(cell)) {
                    openings.push(cell)
                }
            }
        }
        if (openings.length && openings.length <= 4 && this.countItems(BUILDING_BLOCKS) >= openings.length) {
            for (const cell of openings) {
                this.checkAction(signal)
                await this.placeSurvivalBlock(cell).catch(error => this.log.warn(`Creeper seal placement failed at ${cell}: ${error.message}`))
            }
            this.checkAction(signal)
            if (!this.canSee(creeper)) {
                this.log.info(`Sealed ${openings.length} opening(s) toward a creeper at ${creeper.position.floored()}.`)
                return
            }
        }
        this.log.info(`Fleeing creeper at ${creeper.position.floored()}; ${openings.length} facing opening(s) could not be sealed.`)
        return this.escapeFrom(creeper)
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
            const dirt = this.findNearestBlock(name => name === 'dirt' || name === 'cobblestone', 16)
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
        await this.placeSurvivalBlock(center.offset(0, 2, 0)).catch(error => failures.push(error.message))
        this.checkAction(signal)
        if (!this.hasEnclosedShelter(center)) {
            this.sheltered = false
            this.shelterCenter = null
            throw new Error(`shelter enclosure incomplete; ${failures.length} placement errors${failures.length ? `: ${failures.at(-1)}` : ''}`)
        }
        this.shelterCenter = center.clone()
        this.memory.shelter = { x: center.x, y: center.y, z: center.z, dimension: this.bot.game.dimension }
        this.sheltered = true
        this.log.info('Emergency shelter enclosure verified; waiting for daylight.')
        await sleep(1000)
        this.checkAction(signal)
    }

    async placeSurvivalBlock (target) {
        const signal = this.actionAbort?.signal
        this.checkAction(signal)
        await clearPlants(this, [target])
        this.checkAction(signal)
        const existing = this.bot.blockAt(target)
        if (!this.isEmptyPlacementBlock(existing)) {
            return
        }
        const item = this.bestItem(BUILDING_BLOCKS)
        if (!item) {
            throw new Error('out of shelter blocks')
        }
        const references = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]
        for (const [dx, dy, dz] of references) {
            const ref = this.bot.blockAt(target.offset(dx, dy, dz))
            if (!ref || ref.boundingBox !== 'block') {
                continue
            }
            await this.bot.equip(item, 'hand')
            this.checkAction(signal)
            await this.bot.placeBlock(ref, new Vec3(-dx, -dy, -dz))
            this.checkAction(signal)
            return
        }
        throw new Error(`no support for block at ${target}`)
    }

    async breakBlockAt (position) {
        const block = this.bot.blockAt(position)
        if (block && block.name !== 'air' && this.bot.canDigBlock(block)) {
            await this.bot.dig(block, true)
        }
    }

    async ensurePlanks (minimum) {
        while (this.countMatching(name => name.endsWith('_planks')) < minimum) {
            const log = this.bot.inventory.items().find(item => LOG_SUFFIXES.some(suffix => item.name.endsWith(suffix)))
            if (!log) {
                throw new Error('need more logs')
            }
            const plankName = log.name
                .replace(/_log$/, '_planks')
                .replace(/_wood$/, '_planks')
                .replace(/_stem$/, '_planks')
                .replace(/_hyphae$/, '_planks')
            await this.craftItem(plankName, 4, false)
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
        const block = this.mcData && this.mcData.blocksByName[name]
        if (!block) {
            return null
        }
        return this.bot.findBlock({ matching: block.id, maxDistance })
    }

    async getStation (name) {
        let station = this.findStation(name, 4)
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
        await this.collectTarget(current, current, 'workstation')
        this.memory.ownedStations.delete(key)
    }

    async explore () {
        if (this.isNight()) {
            return this.makeNightSafe()
        }
        await this.scout(36)
    }

    async scout (distance) {
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
        try {
            await this.gotoWithTimeout(new GoalNear(selected.x, Math.floor(here.y), selected.z, 3), 25000, 'land scouting')
            this.memory.scoutVisits.set(selected.visitKey, selected.visits + 1)
            this.scoutAngle = selected.angle + Math.PI / 8
            this.scoutSteps += 1
        } catch (error) {
            this.scoutAngle += Math.PI / 3
            this.scoutSteps += 1
            throw error
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
            (!options.visible || this.bot.canSeeBlock(block)) &&
            (!options.filter || options.filter(block))
        return this.bot.findBlock(search)
    }

    nearestEntity (names, maxDistance = 16) {
        return this.bot.nearestEntity(entity => {
            const name = entity.name || entity.mobType
            return entity.isValid && names.has(name) && (!PREY.has(name) || !this.isBlockedTarget(entity)) &&
                this.bot.entity.position.distanceTo(entity.position) <= maxDistance
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
        movements.allow1by1towers = false
        movements.allowParkour = false
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
        const names = ['crafting_table', 'stick', 'wooden_pickaxe', 'wooden_sword', 'cobblestone', 'stone_pickaxe', 'furnace', 'coal', 'raw_iron', 'iron_ingot', 'iron_pickaxe']
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
        this.actionAbort?.abort()
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
        this.bot.clearControlStates()
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
    SurvivalController, HOSTILES, PREY, FOOD_VALUES, actionMadeProgress,
    shouldRelocateAfterStationFailure, mobilityRecoveryKind,
    pathfinderDropLimitForLanding, SAFE_PATHFINDER_DROP,
    heapPressureExceeded, PATH_SEARCH_RADIUS, HEAP_GUARD_BYTES
}
