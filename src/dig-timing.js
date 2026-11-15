'use strict'

// Vanilla 26.1.2 held attack (MultiPlayerGameMode.continueDestroyBlock): a timed break sets
// destroyDelay = 5; five ticks count it down, and the sixth calls startDestroyBlock, which sends
// START with no progress. So START follows a timed break by 6 ticks and the next break n ticks later
// (n from float32 progress accumulation). Instant breaks set no delay but continueAttack runs once a tick.
const TICK_MS = 50
const BREAK_GAP_MS = 6 * TICK_MS
const CONTINUOUS_GAP_MS = 2000
const SUMMARY_EVERY = 32

function digWaitMs (state, now) {
    return Math.max(0, (state.lastTimedBreakAt ?? -Infinity) + BREAK_GAP_MS - now,
        (state.lastBreakAt ?? -Infinity) + TICK_MS - now)
}

function median (values) {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN
}

// samples: { durationMs, modelMs, gapMs } per timed break; gapMs is null after a pause in mining.
function digSummary (samples) {
    const gaps = samples.map(s => s.gapMs).filter(gap => gap !== null)
    const continuous = samples.filter(s => s.gapMs !== null)
    const cycleMs = continuous.reduce((sum, s) => sum + s.gapMs + s.durationMs, 0)
    const atFloor = gaps.filter(gap => gap <= BREAK_GAP_MS + TICK_MS).length
    return {
        durationMs: median(samples.map(s => s.durationMs)),
        modelMs: median(samples.map(s => s.modelMs)),
        gapMs: median(gaps),
        atFloor: gaps.length ? atFloor / gaps.length : NaN,
        blocksPerSecond: cycleMs > 0 ? continuous.length * 1000 / cycleMs : NaN
    }
}

function recordDig (state, log, sample) {
    const samples = (state.digSamples ||= [])
    samples.push(sample)
    if (samples.length < SUMMARY_EVERY) {
        return null
    }
    const s = digSummary(samples)
    samples.length = 0
    log?.info?.(`Dig timing over ${SUMMARY_EVERY} timed breaks: start-to-break median ${s.durationMs} ms ` +
        `(vanilla ${s.modelMs} ms); break-to-next-start median ${s.gapMs} ms (vanilla held ${BREAK_GAP_MS} ms, ` +
        `${Math.round(s.atFloor * 100)}% within a tick of it); ${s.blocksPerSecond.toFixed(2)} blocks/s while continuous.`)
    return s
}

module.exports = { TICK_MS, BREAK_GAP_MS, CONTINUOUS_GAP_MS, digWaitMs, digSummary, recordDig }
