'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { until } = require('./progression-skills')
const { canSeeBlock } = require('./vision')
const { dryMovements } = require('./cave-exploration')
const { reachGoal } = require('./tree-climb')

// [hunger points, saturation] per item, vanilla Java values.
const FOODS = {
    cooked_beef: [8, 12.8], cooked_porkchop: [8, 12.8], cooked_mutton: [6, 9.6], cooked_chicken: [6, 7.2],
    cooked_rabbit: [5, 6], cooked_cod: [5, 6], cooked_salmon: [6, 9.6], bread: [5, 6], baked_potato: [5, 6],
    golden_carrot: [6, 14.4], beef: [3, 1.8], porkchop: [3, 1.8], mutton: [2, 1.2], chicken: [2, 1.2],
    rabbit: [3, 1.8], cod: [2, 0.4], salmon: [2, 0.4], tropical_fish: [1, 0.2], apple: [4, 2.4], carrot: [3, 3.6], potato: [1, 0.6],
    sweet_berries: [2, 0.4], glow_berries: [2, 0.4], melon_slice: [2, 1.2], dried_kelp: [1, 0.6],
    mushroom_stew: [6, 7.2], beetroot_soup: [6, 7.2]
}
const FOOD_VALUES = Object.fromEntries(Object.entries(FOODS).map(([name, [hunger]]) => [name, hunger]))
const COOKED = { beef: 'cooked_beef', porkchop: 'cooked_porkchop', mutton: 'cooked_mutton', chicken: 'cooked_chicken',
    rabbit: 'cooked_rabbit', cod: 'cooked_cod', salmon: 'cooked_salmon', potato: 'baked_potato' }
const LAND_MEATS = ['cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'cooked_rabbit']
const meal = name => FOODS[name][0] + FOODS[name][1]
// User direction (2026-11-06): 16 average cooked land meats before mining (16 x 16.28 = 260.5).
// Hunger plus saturation is what a meal restores eaten hungry; saturation alone would rate a
// glow berry at 1/32 of a steak and demand ~390 of them.
const MIN_MINING_MEALS = 16 * LAND_MEATS.reduce((sum, name) => sum + meal(name), 0) / LAND_MEATS.length
const VINES = ['cave_vines', 'cave_vines_plant']
// Fish by cooked meal value; pufferfish poisons and axolotls are not food.
const FISH = ['salmon', 'cod', 'tropical_fish']
const MUSHROOMS = ['red_mushroom', 'brown_mushroom']
const AIR = new Set(['air', 'cave_air'])
// Stew does not stack; four stews keep pack space for ore.
const MAX_STEWS = 4
const SECONDS_PER_ITEM = 10

// Raw food counts at its cooked value: cooking jobs convert it before the bot leaves.
function mealReserve(items) {
    return items.reduce((sum, item) => {
        const name = COOKED[item.name] || item.name
        return FOODS[name] ? sum + item.count * meal(name) : sum
    }, 0)
}

// Vanilla burn ticks per fuel item; a furnace takes 200 ticks per item. Nether wood does not burn.
const BURN_TICKS = { coal: 1600, charcoal: 1600, coal_block: 16000, blaze_rod: 2400, lava_bucket: 20000, stick: 100 }
const burnTicks = name => BURN_TICKS[name] ?? 300

// User direction (2026-11-11): a furnace job is due when its fuel runs out or its input is done, by world
// ticks: those left in the burning item plus the fuel slot's burn time. mineflayer can report a burning
// furnace's first fuel property before its total, so the window settles two ticks first.
async function furnaceDue(bot, furnace, count) {
    await bot.waitForTicks?.(2)
    const burning = furnace.totalFuel ? Math.round((furnace.fuel || 0) * furnace.totalFuel) : 0
    const slot = furnace.fuelItem()
    const fuel = burning + (slot ? slot.count * burnTicks(slot.name) : 0)
    const input = count * 200 - Math.round((furnace.progress || 0) * (furnace.totalProgress || 200))
    const ticks = Math.max(0, Math.min(fuel, input)) + 20
    return { readyAtTick: bot.time?.age != null ? bot.time.age + ticks : null, readyAt: Date.now() + ticks * 50 }
}

function jobDue(bot, job) {
    return job.readyAtTick != null && bot.time?.age != null ? bot.time.age >= job.readyAtTick : Date.now() >= job.readyAt
}

function cookFuel(c, count) {
    const coal = c.bestItem(['coal', 'charcoal'])
    if (coal) {
        return { item: coal, count: Math.ceil(count / 8) }
    }
    // Planks and logs each burn 1.5 items.
    const wood = c.bot.inventory.items().filter(item => /_(planks|log)$/.test(item.name) && !/^(crimson|warped)_/.test(item.name))
        .sort((a, b) => Number(b.name.endsWith('_planks')) - Number(a.name.endsWith('_planks')) || b.count - a.count)[0]
    return wood ? { item: wood, count: Math.ceil(count / 1.5) } : null
}

function foodState(c, state) {
    const items = c.bot.inventory.items()
    state.mealReserve = mealReserve(items)
    state.rawFood = c.countItems(Object.keys(COOKED))
    const distance = j => j.dimension === state.dimension ? c.bot.entity.position.distanceTo(new Vec3(j.x, j.y, j.z)) : Infinity
    // Reach by furnace: an underground one serves the night miner beside it; a surface one is visited by
    // day (300 blocks on the surface, 64 from below) and at night only at hand (user direction 2026-11-11).
    const reach = j => j.underground ? 64 : state.isNight ? 8 : state.underground ? 64 : 300
    // memory.cookJob is the active job; out-of-reach jobs park so raw food can cook where the bot is.
    let jobs = [c.memory.cookJob, ...(c.memory.parkedCookJobs || [])].filter(Boolean)
    for (const j of jobs.filter(j => distance(j) > 300 && distance(j) < Infinity)) {
        c.log.warn(`Abandoning the distant cooking job at ${j.x},${j.y},${j.z} (${j.count} ${j.input}).`)
    }
    jobs = jobs.filter(j => !(distance(j) > 300 && distance(j) < Infinity))
    let job = jobs.find(j => j === c.memory.cookJob) || jobs.find(j => distance(j) <= reach(j)) || null
    if (job && distance(job) > reach(job) && state.rawFood > 0) {
        job = null
    }
    c.memory.cookJob = job
    c.memory.parkedCookJobs = jobs.filter(j => j !== job)
    // Food in our furnaces is reserve: uncounted, 15 mutton set cooking sent the hunt scouting away (06:55Z).
    state.mealReserve += mealReserve(jobs.filter(j => distance(j) < Infinity).map(j => ({ name: j.input, count: j.count })))
    state.cookJob = job && distance(job) <= reach(job) ? { ready: jobDue(c.bot, job) } : null
    // A surface job must finish by nightfall (tick 12500, 200 ticks an item): one started at 12356 left
    // porkchop above a night miner (07:00Z), so dusk cooking waits for the underground furnace.
    const time = c.bot.time?.timeOfDay ?? 0
    const batch = Math.min(64, Math.max(0, ...c.bot.inventory.items().filter(i => COOKED[i.name]).map(i => c.countItems([i.name]))))
    const dusk = !state.underground && time < 12500 && time + 200 * (batch + 1) > 12500
    const smelting = Boolean(c.memory.smeltJob)
    state.canCook = state.rawFood > 0 && !job && !smelting && !dusk && state.hostileDistance > 12 &&
        !(c.memory.cookBlockedUntil > Date.now()) && state.freeInventorySlots >= 1 &&
        (state.hasFurnace || state.cobblestone >= 8) && Boolean(cookFuel(c, 1))
    state.foodOpportunity = state.mealReserve < MIN_MINING_MEALS && state.health >= 12 && state.hostileDistance > 12 &&
        state.freeInventorySlots >= 1 ? foodOpportunity(c, state) : null
    return state
}

// User direction (2026-11-06): while the meal reserve is short, take food found on the way:
// fish (oceans, rivers and lush caves keep respawning them), glow berries, mushroom stew.
function foodOpportunity(c, state) {
    const bot = c.bot
    const here = bot.entity.position
    // Fish within three blocks of open air are reached by swimming at the surface, not diving.
    const fish = Object.values(bot.entities || {}).filter(e => e.isValid && FISH.includes(e.name) && here.distanceTo(e.position) <= 16 &&
        !c.isBlockedTarget(e) && (c.canSee?.(e) ?? true) &&
        [1, 2, 3].some(k => AIR.has(bot.blockAt(e.position.floored().offset(0, k, 0), false)?.name)))
        .sort((a, b) => FISH.indexOf(a.name) - FISH.indexOf(b.name) || here.distanceTo(a.position) - here.distanceTo(b.position))
    if (fish[0] && fish[0].name !== 'tropical_fish') {
        return { action: 'hunt_fish', target: fish[0] }
    }
    const vine = c.findNearestBlock(name => VINES.includes(name), 16, {
        filter: block => block.getProperties?.().berries === true
    })
    if (vine) {
        return { action: 'pick_glow_berries', target: vine }
    }
    const canBowl = c.countItems(['bowl']) > 0 || (state.hasCraftingTable && (state.planks >= 3 || state.logs > 0))
    if (canBowl && c.countItems(['mushroom_stew']) < MAX_STEWS &&
        MUSHROOMS.every(name => c.countItems([name]) > 0 ||
            c.findNearestBlock(block => block === name || block === `${name}_block`, 16, { mining: true }))) {
        return { action: 'gather_mushroom_stew', target: null }
    }
    return fish[0] ? { action: 'hunt_fish', target: fish[0] } : null
}

// Shallow-water melee: the fight follows the fish and collects its drop; the guard surfaces early.
async function huntFish(c, target) {
    if (!target?.isValid) {
        return
    }
    c.log.info(`Food opportunity: ${target.name} at ${target.position.floored()}.`)
    const p = c.bot.entity.position.floored()
    c.memory.fishWater = { x: p.x, y: p.y, z: p.z, dimension: c.bot.game.dimension, at: Date.now(), misses: 0 }
    await c.fight(target, true, () => (c.bot.oxygenLevel ?? 20) < 15 ? 'fish hunt is short of air' :
        c.bot.health < 12 ? 'fish hunt health limit' : null)
}

// Fish respawn across a large body of water; a shore where fish were hunted in the last ten
// minutes is worth a short wait before scouting elsewhere. Two empty waits forget it.
async function waitForFish(c) {
    const spot = c.memory.fishWater
    const here = c.bot.entity.position
    if (!spot || spot.dimension !== c.bot.game.dimension || Date.now() - spot.at > 600000 ||
        here.distanceTo(new Vec3(spot.x, spot.y, spot.z)) > 64) {
        return false
    }
    if (here.distanceTo(new Vec3(spot.x, spot.y, spot.z)) > 4) {
        await c.gotoWithTimeout(new goals.GoalNear(spot.x, spot.y, spot.z, 3), 20000, 'fishing shore')
    }
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
        c.checkAction()
        const target = foodOpportunity(c, c.observe())
        if (target?.action === 'hunt_fish') {
            return huntFish(c, target.target).then(() => true)
        }
        await c.bot.waitForTicks(20)
    }
    if (++spot.misses >= 2) {
        c.memory.fishWater = null
    }
    return true
}

// Fire-and-forget like iron smelting: load one raw type with fuel, record the job, keep working.
async function startCooking(c, state) {
    const signal = c.actionAbort?.signal
    if (!c.hasItem('furnace') && !c.findStation('furnace', 4)) {
        await c.ensureItem('furnace', 1, true)
        c.checkAction(signal)
    }
    const block = await c.getFurnace(true)
    const furnace = await c.bot.openFurnace(block)
    try {
        // Leftover output (charcoal, ingots) is the bot's own and is collected; foreign input blocks.
        const busy = furnace.inputItem() && !FOODS[furnace.inputItem().name] ? furnace.inputItem() : null
        if (busy) {
            c.memory.cookBlockedUntil = Date.now() + 60000
            throw new Error(`furnace is busy with ${busy.name}`)
        }
        if (furnace.outputItem()) {
            await furnace.takeOutput()
        }
        // Raw food already in the slot (an earlier interrupted job) is adopted rather than mixed.
        const current = furnace.inputItem()
        const raw = current || c.bot.inventory.items().filter(item => COOKED[item.name]).sort((a, b) => b.count - a.count)[0]
        if (!raw) {
            return
        }
        const count = current ? current.count : Math.min(64, c.countItems([raw.name]))
        const fuel = cookFuel(c, count)
        if (!fuel && !furnace.fuelItem()) {
            throw new Error('no furnace fuel for cooking')
        }
        if (!current) {
            await furnace.putInput(raw.type, null, count)
        }
        const p = block.position
        c.memory.cookJob = { dimension: c.bot.game.dimension, x: p.x, y: p.y, z: p.z, input: raw.name, count,
            underground: Boolean(state?.underground), readyAt: Date.now() + count * SECONDS_PER_ITEM * 1000 + 1000 }
        if (!furnace.fuelItem()) {
            await furnace.putFuel(fuel.item.type, null, Math.min(fuel.count, c.countItems([fuel.item.name])))
        }
        Object.assign(c.memory.cookJob, await furnaceDue(c.bot, furnace, count))
        c.log.info(`Cooking ${count} ${raw.name} at ${p}; due in about ${Math.round((c.memory.cookJob.readyAt - Date.now()) / 1000)} s.`)
    } finally {
        await c.bot.closeWindow(furnace).catch(() => {})
    }
}

async function collectCooking(c, job) {
    const position = new Vec3(job.x, job.y, job.z)
    const known = c.bot.blockAt(position)
    if (known && known.name !== 'furnace') {
        c.memory.cookJob = null
        throw new Error(`cooking furnace at ${position} is gone`)
    }
    if (c.bot.entity.position.distanceTo(position.offset(0.5, 0.5, 0.5)) > 4) {
        const goal = new goals.GoalLookAtBlock(position, c.bot.world, { reach: 4, entityHeight: c.bot.entity.eyeHeight ?? 1.62 })
        // 400 ms a block: a fixed 8 s, set when jobs lay within 64 blocks, looped 21 detours 210 blocks out (07:53Z).
        const walkMs = Math.max(8000, 400 * c.bot.entity.position.distanceTo(position))
        c.bot.pathfinder.setMovements(dryMovements(c.bot))
        try {
            try {
                await c.gotoWithTimeout(goal, walkMs, 'cooking furnace return')
                c.checkAction()
                if (!goal.isEnd(c.bot.entity.position.floored())) {
                    throw new Error('No path: cooking furnace approach not reached')
                }
            } catch (error) {
                if (c.actionAbort?.signal.aborted || !/no path|timed out/i.test(error.message)) {
                    throw error
                }
                c.bot.pathfinder.setGoal(null)
                await c.bot.waitForTicks(2)
                c.checkAction()
                const here = c.bot.entity.position
                const angle = Math.atan2(position.z - here.z, position.x - here.x) +
                    ((job.returnDetours || 0) % 2 ? -Math.PI / 2 : Math.PI / 2)
                job.returnDetours = (job.returnDetours || 0) + 1
                const detour = new goals.GoalNearXZ(Math.floor(here.x + 6 * Math.cos(angle)), Math.floor(here.z + 6 * Math.sin(angle)), 1)
                c.log.info(`Cooking furnace approach stalled; trying a supported lateral detour (${job.returnDetours}).`)
                await c.gotoWithTimeout(detour, 4000, 'cooking furnace detour')
                c.checkAction()
                if (!detour.isEnd(c.bot.entity.position.floored())) {
                    throw new Error('cooking furnace detour not reached')
                }
                await c.gotoWithTimeout(goal, walkMs, 'cooking furnace return')
                c.checkAction()
                if (!goal.isEnd(c.bot.entity.position.floored())) {
                    throw new Error('cooking furnace approach not reached after detour')
                }
            }
        } finally {
            c.bot.pathfinder.setMovements(c.movements)
        }
    }
    const block = c.bot.blockAt(position)
    if (block?.name !== 'furnace') {
        c.memory.cookJob = null
        throw new Error(`cooking furnace at ${position} is gone`)
    }
    const furnace = await c.bot.openFurnace(block)
    let finished = false
    try {
        // A departing bot waits out the job here; one called when ready waits only a few seconds.
        await until(c, () => !furnace.inputItem(), Math.min(100000, Math.max(5000, job.readyAt - Date.now() + 3000))).catch(() => {})
        if (furnace.outputItem()) {
            await furnace.takeOutput()
        }
        if (!furnace.inputItem()) {
            if (furnace.fuelItem()) {
                await furnace.takeFuel()
            }
            finished = true
            c.memory.cookJob = null
        } else {
            const left = furnace.inputItem().count
            const fuel = !furnace.fuelItem() && cookFuel(c, left)
            if (fuel) {
                await furnace.putFuel(fuel.item.type, null, Math.min(fuel.count, c.countItems([fuel.item.name])))
            }
            if (!fuel && !furnace.fuelItem() && !(furnace.fuel > 0)) {
                // Out of fuel with none carried: take the raw food back rather than revisit every
                // ten seconds (three trips, the last into lava: death #8, 17:30:22Z).
                await furnace.takeInput()
                finished = true
                c.memory.cookJob = null
            } else {
                Object.assign(job, { count: left, ...await furnaceDue(c.bot, furnace, left) })
            }
        }
    } finally {
        await c.bot.closeWindow(furnace).catch(() => {})
    }
    c.log.info(`Checked cooking at ${position}; ${finished ? 'job complete' : `${job.count} ${job.input} left`}.`)
    if (finished && c.running && !c.actionAbort?.signal.aborted) {
        await c.reclaimStation(block).catch(error => c.log.warn(`Could not reclaim furnace: ${error.message}`))
    }
}

async function cookFood(c, state) {
    const job = c.memory.cookJob
    return job && job.dimension === c.bot.game.dimension ? collectCooking(c, job) : startCooking(c, state)
}

// Ripe cave vines pop one berry on use and keep growing; pick a local cluster per action.
async function pickGlowBerries(c) {
    const signal = c.actionAbort?.signal
    const origin = c.bot.entity.position.clone()
    for (let picked = 0; picked < 16; picked++) {
        c.checkAction(signal)
        if (mealReserve(c.bot.inventory.items()) >= MIN_MINING_MEALS) {
            return
        }
        const vine = c.findNearestBlock(name => VINES.includes(name), picked ? 6 : 16, {
            filter: block => block.getProperties?.().berries === true && (!picked || block.position.distanceTo(origin) <= 12)
        })
        if (!vine) {
            return
        }
        try {
            if (!c.bot.canDigBlock(vine) || !canSeeBlock(c.bot, vine)) {
                await c.gotoWithTimeout(reachGoal(vine.position, c.bot.world), 10000, 'glow berry approach')
            }
            c.checkAction(signal)
            await c.bot.activateBlock(vine)
            await c.bot.waitForTicks(10)
            if (c.bot.blockAt(vine.position)?.getProperties?.().berries === true) {
                throw new Error('vine kept its berries after use')
            }
            const drops = c.visibleDrops(vine.position.offset(0.5, 0.5, 0.5), 6)
            for (const drop of drops) {
                c.checkAction(signal)
                const p = drop.position.floored()
                await c.gotoWithTimeout(new goals.GoalNear(p.x, p.y, p.z, 1), 8000, 'glow berry pickup')
            }
        } catch (error) {
            if (signal?.aborted) {
                throw error
            }
            c.rememberBlockedTarget(vine, 'glow berries', error)
            return
        }
    }
}

module.exports = { FOODS, FOOD_VALUES, COOKED, MIN_MINING_MEALS, mealReserve, foodState, cookFood, furnaceDue, jobDue, pickGlowBerries, huntFish, waitForFish, foodOpportunity }
