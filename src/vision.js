'use strict'

const HORIZONTAL_SLOPE = Math.tan(50 * Math.PI / 180)
const VERTICAL_SLOPE = Math.tan(35 * Math.PI / 180)

function inView(bot, eye, point) {
    const { yaw = 0, pitch = 0 } = bot.entity
    const { x, y, z } = point.minus(eye)
    const horizontal = -x * Math.sin(yaw) - z * Math.cos(yaw)
    const forward = horizontal * Math.cos(pitch) + y * Math.sin(pitch)
    const up = y * Math.cos(pitch) - horizontal * Math.sin(pitch)
    const right = x * Math.cos(yaw) - z * Math.sin(yaw)
    return forward > 0 && Math.abs(right) <= forward * HORIZONTAL_SLOPE && Math.abs(up) <= forward * VERTICAL_SLOPE
}

function blockInView(bot, block, allowTurn = false) {
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
    return (allowTurn || inView(bot, eye, block.position.offset(0.5, 0.5, 0.5))) && bot.canSeeBlock(block)
}

async function scanFor(c, find) {
    const found = find()
    if (found) {
        return found
    }
    const { yaw, pitch } = c.bot.entity
    for (const turn of [0, 1, -1, 2]) {
        c.checkAction()
        await c.bot.look(yaw + turn * Math.PI / 2, 0, true)
        await c.bot.waitForTicks(1)
        c.checkAction()
        const target = find()
        if (target) {
            return target
        }
    }
    await c.bot.look(yaw, pitch, true)
    return null
}

module.exports = { inView, blockInView, scanFor }
