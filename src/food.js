'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { until } = require('./progression-skills')

// [hunger points, saturation] per item, vanilla Java values.
const FOODS = {
    cooked_beef: [8, 12.8], cooked_porkchop: [8, 12.8], cooked_mutton: [6, 9.6], cooked_chicken: [6, 7.2],
    cooked_rabbit: [5, 6], cooked_cod: [5, 6], cooked_salmon: [6, 9.6], bread: [5, 6], baked_potato: [5, 6],
    golden_carrot: [6, 14.4], beef: [3, 1.8], porkchop: [3, 1.8], mutton: [2, 1.2], chicken: [2, 1.2],
    rabbit: [3, 1.8], cod: [2, 0.4], salmon: [2, 0.4], apple: [4, 2.4], carrot: [3, 3.6], potato: [1, 0.6],
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
const SECONDS_PER_ITEM = 10

// Raw food counts at its cooked value: cooking jobs convert it before the bot leaves.
function mealReserve(items) {
    return items.reduce((sum, item) => {
        const name = COOKED[item.name] || item.name
        return FOODS[name] ? sum + item.count * meal(name) : sum
    }, 0)
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
    let job = c.memory.cookJob
    const position = job && new Vec3(job.x, job.y, job.z)
    if (job && job.dimension === state.dimension && c.bot.entity.position.distanceTo(position) > 64) {
        c.log.warn(`Abandoning the distant cooking job at ${position} (${job.count} ${job.input}).`)
        c.memory.cookJob = job = null
    }
    // A furnace left on the surface at nightfall waits for daylight; one beside an underground miner does not.
    state.cookJob = job && job.dimension === state.dimension && (!state.isNight || c.bot.entity.position.distanceTo(position) <= 8)
        ? { ready: Date.now() >= job.readyAt } : null
    const smelting = Boolean(c.memory.smeltJob)
    state.canCook = state.rawFood > 0 && !job && !smelting && state.hostileDistance > 12 &&
        !(c.memory.cookBlockedUntil > Date.now()) && state.freeInventorySlots >= 1 &&
        (state.hasFurnace || state.cobblestone >= 8) && Boolean(cookFuel(c, 1))
    state.glowBerryTarget = null
    if (state.mealReserve < MIN_MINING_MEALS && state.health >= 12 && state.hostileDistance > 12 && state.freeInventorySlots >= 1) {
        state.glowBerryTarget = c.findNearestBlock(name => VINES.includes(name), 16, {
            visible: true, filter: block => block.getProperties?.().berries === true
        })
    }
    return state
}

// Fire-and-forget like iron smelting: load one raw type with fuel, record the job, keep working.
async function startCooking(c) {
    const signal = c.actionAbort?.signal
    if (!c.hasItem('furnace') && !c.findStation('furnace', 4)) {
        await c.ensureItem('furnace', 1, true)
        c.checkAction(signal)
    }
    const block = await c.getFurnace()
    const furnace = await c.bot.openFurnace(block)
    try {
        const busy = [furnace.inputItem(), furnace.outputItem()].find(item => item && !FOODS[item.name])
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
            readyAt: Date.now() + count * SECONDS_PER_ITEM * 1000 + 1000 }
        if (!furnace.fuelItem()) {
            await furnace.putFuel(fuel.item.type, null, Math.min(fuel.count, c.countItems([fuel.item.name])))
        }
        c.log.info(`Cooking ${count} ${raw.name} at ${p}; ready in about ${count * SECONDS_PER_ITEM} s.`)
    } finally {
        await c.bot.closeWindow(furnace).catch(() => {})
    }
}

async function collectCooking(c, job) {
    const position = new Vec3(job.x, job.y, job.z)
    if (c.bot.entity.position.distanceTo(position.offset(0.5, 0.5, 0.5)) > 4) {
        await c.gotoWithTimeout(new goals.GoalNear(position.x, position.y, position.z, 2), 30000, 'cooking furnace return')
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
            Object.assign(job, { count: left, readyAt: Date.now() + left * SECONDS_PER_ITEM * 1000 + 1000 })
        }
    } finally {
        await c.bot.closeWindow(furnace).catch(() => {})
    }
    c.log.info(`Checked cooking at ${position}; ${finished ? 'job complete' : `${job.count} ${job.input} left`}.`)
    if (finished && c.running && !c.actionAbort?.signal.aborted) {
        await c.reclaimStation(block).catch(error => c.log.warn(`Could not reclaim furnace: ${error.message}`))
    }
}

async function cookFood(c) {
    const job = c.memory.cookJob
    return job && job.dimension === c.bot.game.dimension ? collectCooking(c, job) : startCooking(c)
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
            visible: true, filter: block => block.getProperties?.().berries === true && (!picked || block.position.distanceTo(origin) <= 12)
        })
        if (!vine) {
            return
        }
        try {
            if (!c.bot.canDigBlock(vine) || !c.bot.canSeeBlock(vine)) {
                await c.gotoWithTimeout(new goals.GoalLookAtBlock(vine.position, c.bot.world), 10000, 'glow berry approach')
            }
            c.checkAction(signal)
            await c.bot.activateBlock(vine)
            await c.bot.waitForTicks(10)
            if (c.bot.blockAt(vine.position)?.getProperties?.().berries === true) {
                throw new Error('vine kept its berries after use')
            }
            const drops = Object.values(c.bot.entities).filter(e => e.isValid && e.name === 'item' &&
                e.position.distanceTo(vine.position.offset(0.5, 0.5, 0.5)) <= 6)
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

module.exports = { FOODS, FOOD_VALUES, COOKED, MIN_MINING_MEALS, mealReserve, foodState, cookFood, pickGlowBerries }
