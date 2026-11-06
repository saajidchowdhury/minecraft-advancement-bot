'use strict'

const { closeSync, existsSync, fstatSync, openSync, readSync } = require('node:fs')
const { join } = require('node:path')
const { StringDecoder } = require('node:string_decoder')
const { setTimeout: delay } = require('node:timers/promises')

function important(line) {
    const damage = line.match(/Damage: hp=([\d.]+)->([\d.]+)/)
    return /\[ERROR\]|Advancement earned:|Equipped iron_pickaxe for mining|Bot died|Disconnected:/.test(line) ||
        /failed \((?:3|10)\):|Cancelled task retained control/.test(line) ||
        (damage && Number(damage[1]) > 6 && Number(damage[2]) <= 6)
}

async function watch(run, seconds) {
    const log = openSync(join(run, 'bot.log'), 'r')
    const finished = join(run, 'finished.json')
    const buffer = Buffer.alloc(16384)
    const decoder = new StringDecoder('utf8')
    const deadline = Date.now() + seconds * 1000
    let position = fstatSync(log).size
    let partial = ''
    let silentSince = Date.now()
    console.log(`Watching ${run} for ${seconds} s.`)
    try {
        while (Date.now() < deadline) {
            const bytes = readSync(log, buffer, 0, buffer.length, position)
            if (bytes) {
                position += bytes
                silentSince = Date.now()
                const lines = (partial + decoder.write(buffer.subarray(0, bytes))).split('\n')
                partial = lines.pop()
                for (const line of lines) {
                    if (important(line)) {
                        console.log(line)
                    }
                }
                continue
            }
            if (existsSync(finished)) {
                console.log(`Run finished: ${run}`)
                return
            }
            if (Date.now() - silentSince >= 300000) {
                console.log(`No new bot logs for 5 min: ${run}`)
                silentSince = Infinity
            }
            await delay(1000)
        }
        console.log(`Watch ended: ${run}`)
    } finally {
        closeSync(log)
    }
}

const [, , run, duration = '1800'] = process.argv
const seconds = Number(duration)
if (!run || !Number.isSafeInteger(seconds) || seconds < 1) {
    console.error('Usage: node scripts/watch.js <run-directory> [seconds]')
    process.exitCode = 2
} else {
    watch(run, seconds).catch(error => {
        console.error(error.message)
        process.exitCode = 1
    })
}
