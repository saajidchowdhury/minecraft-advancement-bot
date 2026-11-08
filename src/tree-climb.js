'use strict'

const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const { canSeeBlock } = require('./vision')

const EYE = 1.62           // player eye height, blocks
const REACH = 4.4          // eye-to-centre reach, blocks; canDigBlock allows 5.1
const MAX_PILLAR = 5       // blocks of scaffold; a knock-off from the top is a survivable fall
// Dirt first: an interrupted climb leaves a pillar that descendSafely() already knows how to dig down.
const SCAFFOLD = ['dirt', 'coarse_dirt', 'cobblestone', 'cobbled_deepslate', 'netherrack', 'andesite', 'diorite', 'granite', 'tuff']
const isLog = name => /_(log|stem|wood|hyphae)$/.test(name) && !name.startsWith('stripped_')
const centre = p => p.offset(0.5, 0.5, 0.5)

// GoalLookAtBlock measures from the feet node to the block raised by entityHeight, so an
// overhead block loses ~3.2 blocks of reach (only logs up to feet+2 counted). Measure eye to centre.
class GoalReachBlock extends goals.GoalLookAtBlock {
    isEnd (node) {
        const eye = new Vec3(node.x + 0.5, node.y + this.entityHeight, node.z + 0.5)
        const c = centre(this.pos)
        if (eye.distanceTo(c) > this.reach) {
            return false
        }
        for (const axis of ['y', 'x', 'z']) {
            const d = eye[axis] - c[axis]
            if (Math.abs(d) <= 0.5) {
                continue
            }
            const face = c.clone()
            face[axis] += Math.sign(d) * 0.5
            const hit = this.world.raycast(eye, face.minus(eye).normalize(), this.reach)
            if (hit?.position.equals(this.pos)) {
                return true
            }
        }
        return false
    }
}

function reachGoal (pos, world) {
    return new GoalReachBlock(pos, world, { reach: 4.5, entityHeight: EYE })
}

const open = b => b && (b.boundingBox === 'empty' || b.name.endsWith('_leaves')) && !['water', 'lava', 'fire'].includes(b.name)
const footing = b => b && b.boundingBox === 'block' && !b.name.endsWith('_leaves') && !['magma_block', 'powder_snow'].includes(b.name)

// Smallest pillar h (blocks) that puts the eye within REACH of the log from column (x, z) standing at feetY.
function pillarHeight (x, feetY, z, log, max = MAX_PILLAR) {
    for (let h = 0; h <= max; h++) {
        if (new Vec3(x + 0.5, feetY + h + EYE, z + 0.5).distanceTo(centre(log)) <= REACH) {
            return h
        }
    }
    return null
}

// Column beside or under the log with solid ground and open cells from the feet to the head at the top.
function choosePillar (bot, log, max = MAX_PILLAR) {
    let best = null
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const x = log.x + dx
            const z = log.z + dz
            let ground = null
            for (let y = log.y - 1; y >= log.y - 12; y--) {
                const b = bot.blockAt(new Vec3(x, y, z))
                if (!b) {
                    break
                }
                if (!open(b)) {
                    ground = footing(b) ? y : null
                    break
                }
            }
            if (ground === null) {
                continue
            }
            const h = pillarHeight(x, ground + 1, z, log, max)
            if (h === null || h === 0) {
                continue
            }
            let clear = true
            for (let y = ground + 1; y <= ground + h + 2; y++) {
                clear = clear && open(bot.blockAt(new Vec3(x, y, z)))
            }
            const cost = h + 0.1 * bot.entity.position.distanceTo(new Vec3(x + 0.5, ground + 1, z + 0.5))
            if (clear && (!best || cost < best.cost)) {
                best = { base: new Vec3(x, ground + 1, z), h, cost }
            }
        }
    }
    return best
}

function scaffoldItem (bot) {
    const items = bot.inventory.items()
    return SCAFFOLD.map(name => items.find(item => item.name === name)).find(Boolean) ||
        items.find(item => isLog(item.name)) || null
}

const scaffoldCount = bot => bot.inventory.items()
    .reduce((n, item) => n + (SCAFFOLD.includes(item.name) || isLog(item.name) ? item.count : 0), 0)

async function ticksUntil (bot, predicate, ticks) {
    for (let i = 0; i < ticks; i++) {
        if (predicate()) {
            return true
        }
        await bot.waitForTicks(1)
    }
    return predicate()
}

async function clearHead (c, feet) {
    const head = c.bot.blockAt(feet.offset(0, 2, 0))
    if (head?.name.endsWith('_leaves')) {
        await c.bot.dig(head, true)
    } else if (!head || head.boundingBox !== 'empty') {
        throw new Error(`pillar headroom blocked by ${head?.name || 'unloaded block'}`)
    }
}

// Jump and place one scaffold block into the vacated feet cell; returns the placed position.
// use_item_on goes out at once but the position packet only at the next physics tick, so place one
// tick after passing y0+1.15 (peak 1.25) || the server still sees the bot inside the cell (live 01:22Z).
async function towerStep (c, signal, attempts = 3) {
    const bot = c.bot
    const feet = bot.entity.position.floored()
    await clearHead(c, feet)
    const item = scaffoldItem(bot)
    if (!item) {
        throw new Error('no scaffold blocks left for the tree pillar')
    }
    await bot.equip(item, 'hand')
    bot.clearControlStates?.()
    await bot.look(bot.entity.yaw, -Math.PI / 2, true)
    await bot.waitForTicks(2)
    for (let attempt = 1; ; attempt++) {
        c.checkAction(signal)
        const y0 = bot.entity.position.y
        let error = null
        bot.setControlState('jump', true)
        try {
            if (!await ticksUntil(bot, () => bot.entity.position.y > y0 + 1.15, 12)) {
                throw new Error('pillar jump did not clear the placement cell')
            }
            await bot.waitForTicks(1)
            await bot._placeBlockWithOptions(bot.blockAt(feet.offset(0, -1, 0)), new Vec3(0, 1, 0), { forceLook: 'ignore', swingArm: 'right' })
        } catch (e) {
            error = e
        } finally {
            bot.setControlState('jump', false)
        }
        const placed = bot.blockAt(feet)?.boundingBox === 'block'
        await ticksUntil(bot, () => bot.entity.onGround && bot.entity.position.y >= (placed ? y0 + 0.9 : y0 - 0.1), 30)
        if (placed && bot.entity.position.y >= y0 + 0.9) {
            return feet
        }
        if (placed || attempt >= attempts || !/refused|did not answer/.test(error?.message ?? '')) {
            throw error || new Error('did not land on the placed pillar block')
        }
        c.log.warn(`Pillar placement at ${feet} refused (try ${attempt}); retrying.`)
    }
}

// Dig our own pillar from the top down; each dug block drops into the cell the bot falls into.
async function descendPillar (c, placed) {
    const bot = c.bot
    while (placed.length) {
        const cell = placed[placed.length - 1]
        const under = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
        if (!under?.position.equals(cell)) {
            throw new Error(`pillar descent expected scaffold at ${cell}, found ${under?.name} at ${under?.position}`)
        }
        await bot.tool.equipForBlock(under, { getFromChest: false })
        const y0 = bot.entity.position.y
        await bot.dig(under, true)
        if (!await ticksUntil(bot, () => bot.entity.onGround && bot.entity.position.y <= y0 - 0.9, 40)) {
            throw new Error('pillar descent did not land')
        }
        placed.pop()
    }
}

// Logs of the tree around the pillar column, excluding our own scaffold (log scaffold joins the vein).
function treeLogs (bot, base, placed) {
    const own = new Set(placed.map(p => p.toString()))
    const logs = []
    for (let dy = 0; dy <= 14; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const b = bot.blockAt(base.offset(dx, dy, dz))
                if (b && isLog(b.name) && !own.has(b.position.toString())) {
                    logs.push(b)
                }
            }
        }
    }
    return logs
}

async function harvestReachable (c, base, placed, signal) {
    const bot = c.bot
    const logs = treeLogs(bot, base, placed).filter(b => bot.canDigBlock(b) && canSeeBlock(bot, b))
        .sort((a, b) => b.position.y - a.position.y)
    let dug = 0
    for (const log of logs) {
        c.checkAction(signal)
        await bot.tool.equipForBlock(log, { requireHarvest: true, getFromChest: false })
        await bot.dig(log, true)
        dug += 1
    }
    return dug
}

// Dig loose dirt beside the column (not under the bot or the column) until `need` scaffold blocks are held.
async function gatherScaffold (c, base, need) {
    const bot = c.bot
    for (let tries = 0; tries < need + 3 && scaffoldCount(bot) < need; tries++) {
        const feet = bot.entity.position.floored()
        let pick = null
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                for (let dy = -2; dy <= 1; dy++) {
                    const b = bot.blockAt(base.offset(dx, dy, dz))
                    const column = b?.position.x === base.x && b?.position.z === base.z
                    const support = b?.position.equals(feet.offset(0, -1, 0))
                    if (b && ['dirt', 'grass_block', 'coarse_dirt'].includes(b.name) && !column && !support &&
                        bot.blockAt(b.position.offset(0, 1, 0))?.boundingBox === 'empty' &&
                        (!pick || b.position.distanceTo(feet) < pick.position.distanceTo(feet))) {
                        pick = b
                    }
                }
            }
        }
        if (!pick) {
            break
        }
        await c.collectTarget(pick, pick, 'pillar scaffold')
    }
    if (scaffoldCount(bot) < need) {
        throw new Error(`tree pillar needs ${need} scaffold blocks, have ${scaffoldCount(bot)}`)
    }
}

// Plan against the tree's highest log; the targeted (usually lowest) log may already be in reach.
function treePillar (bot, log, max = MAX_PILLAR) {
    const top = treeLogs(bot, log.position, []).reduce((a, b) => b.position.y > a.position.y ? b : a, log)
    return choosePillar(bot, top.position, max)
}

// Pillar up beside a tree whose remaining logs are above standing reach, cut them, then dig the
// pillar back down (recovering the scaffold) and collect the fallen logs.
async function climbForLog (c, log, { maxPillar = MAX_PILLAR, approachMs = 10000 } = {}) {
    const bot = c.bot
    const signal = c.actionAbort?.signal
    const plan = treePillar(bot, log, maxPillar)
    if (!plan) {
        throw new Error(`no open pillar column within ${maxPillar} blocks of ${log.name} at ${log.position}`)
    }
    if (scaffoldCount(bot) < plan.h) {
        await gatherScaffold(c, plan.base, plan.h)
    }
    c.log.info(`Pillaring ${plan.h} block${plan.h === 1 ? '' : 's'} at ${plan.base} to reach ${log.name} at ${log.position}.`)
    await c.gotoWithTimeout(new goals.GoalBlock(plan.base.x, plan.base.y, plan.base.z), approachMs, 'tree pillar base')
    c.checkAction(signal)
    const placed = []
    let dug = 0
    try {
        while (true) {
            const feet = bot.entity.position.floored()
            if (feet.x !== plan.base.x || feet.z !== plan.base.z) {
                throw new Error(`left the pillar column at ${feet}`)
            }
            dug += await harvestReachable(c, plan.base, placed, signal)
            const remaining = treeLogs(bot, plan.base, placed)
            // h = 0 logs are in reach but hidden; only logs that more height would expose count.
            const need = Math.min(...remaining.map(b => pillarHeight(feet.x, feet.y, feet.z, b.position, maxPillar - placed.length))
                .filter(h => h > 0))
            if (!Number.isFinite(need) || !scaffoldItem(bot)) {
                break
            }
            for (let i = 0; i < need; i++) {
                placed.push(await towerStep(c, signal))
                c.checkAction(signal)
            }
        }
    } finally {
        // An aborted action hands the bot to threat handling at once; descent would race it.
        if (!signal?.aborted) {
            await descendPillar(c, placed)
        }
    }
    // Pickup needs the drop in view, and the descent ends looking straight down (live 01:27Z left
    // six ground drops); turn to each settled ground drop. Drops caught on canopy leaves stay.
    await bot.waitForTicks(20)
    const drops = Object.values(bot.entities).filter(e => e.name === 'item' && e.isValid &&
        e.position.distanceTo(plan.base) <= 10 && e.position.y <= plan.base.y + 2)
        .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))
    for (const drop of drops) {
        if (!drop.isValid) {
            continue
        }
        c.checkAction(signal)
        await bot.lookAt(drop.position, true)
        await c.collectTarget([drop], log, 'tree drops').catch(error => {
            if (signal?.aborted) {
                throw error
            }
            c.log.warn(`Tree drop pickup at ${drop.position.floored()} failed: ${error.message}`)
        })
    }
    c.log.info(`Tree pillar cut ${dug} log${dug === 1 ? '' : 's'} and recovered its scaffold.`)
    return dug
}

module.exports = { GoalReachBlock, reachGoal, pillarHeight, choosePillar, treePillar, climbForLog, descendPillar, towerStep, MAX_PILLAR }
