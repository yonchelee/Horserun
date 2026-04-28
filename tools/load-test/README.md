# Horserun load test / validator

End-to-end smoke test for the Cloudflare Worker. Spins up N PartySocket
clients against the live worker, walks them through a full game cycle
(identify → ready → countdown → race → finished → auto-back-to-lobby),
and emits a markdown pass/fail report.

Use it after every server-side or network-layer change to confirm a
production-shaped multi-client scenario still works.

## Run

```bash
# 50-client run (default), prints to stdout, writes report to ./report.md
npm run loadtest -- --n 50

# Custom client count, room name, host, race timeout
npm run loadtest -- --n 100 --room my-test --host horserun.yonchelee.workers.dev --race-timeout-ms 90000

# Custom report path (defaults to tools/load-test/report.md)
npm run loadtest -- --n 50 --report ./my-report.md
```

Defaults:
- `--n 50` — number of simulated clients
- `--room validator-<timestamp>` — auto-generated isolated room
- `--host horserun.yonchelee.workers.dev` — production worker
- `--race-timeout-ms 90000` — abort if the race hasn't finished in 90s

A full run takes ~100–110 seconds for N=50:
- ~3s connect + identify
- ~30s server countdown
- ~30–60s racing
- ~15s post-race reset

## What gets verified

| Check | Pass criterion |
|---|---|
| Connected | N/N WebSockets opened |
| Identified | N/N received `welcome` |
| First state | N/N received first state snapshot |
| Countdown phase observed | At least one client transitioned `lobby → countdown` |
| Racing phase entered | N/N transitioned `countdown → racing` |
| Countdown duration ~30s | Server-side `COUNTDOWN_MS` matches client-observed timing within ±2s |
| Finished messages | ≥ 90% of clients received the `finished` payload |
| No rejected connections | Server didn't reject anyone (e.g., room-full) |
| No abnormal closes | All sockets closed with code 1000 |
| Auto-back-to-lobby | ≥ 90% saw `finished → lobby` cycle within 20s |

The 90% thresholds tolerate network jitter and the edge case where a
slow tail of horses is force-ended by the server's `FINISH_GRACE_MS`
timer (some clients may not see the `finished` broadcast if they
already disconnected).

## Limits / scope

- The script doesn't measure latency precisely — it only counts
  end-to-end events. Use `wrangler tail` for per-message timing.
- It doesn't simulate admin behavior (kick / reset). Add those if you
  want to regression-test those paths too.
- Bots in the room when human count < `MIN_RACERS` (5) tap on their
  own; humans here always tap at sweet-spot rhythm to make the race
  finish in a reasonable time.
- Each run leaves WebSocket connections open until the script exits;
  it can stress the worker briefly. Don't run during real events.

## Implementation

`validator.js` is plain ESM Node, depends only on the project's
already-installed `partysocket`. No build step. Run directly with
`node tools/load-test/validator.js`.

The `loadtest` script in the root `package.json` is just a thin shim
so the standard `npm run …` flow works.
