# proxies.sx Android peer

Android port of the Node peer agent in `../peer.js`. Earns USDC on Solana
by routing customer HTTP/HTTPS traffic through the phone's connection.
Mobile-tier IPs (cellular carrier) earn the platform's top rate ($4.48/GB
at time of writing) versus the host's datacenter tier ($0.56/GB).

## Module layout

| Module | Purpose | Phase |
|---|---|---|
| `:protocol` | Pure Kotlin/JVM. Registration, JWT refresh, WebSocket loop, proxy_request and tunnel_* handlers. Mirrors `peer.js` exactly. Includes a CLI harness for end-to-end verification without Android. | 1 (done) |
| `:app` | Android wrapper. Foreground Service, ongoing notification, EncryptedSharedPreferences for state, simple earnings UI. | 2 (planned) |

## Running the CLI harness

This proves the protocol talks to the live relay before any Android code
exists. Requires JDK 17+ on PATH and Gradle 8.10+ (or `~/tools/gradle-8.10.2`).

```bash
cd wallets/proxies_sx/android
export PROXIES_SX_API_KEY=$(cat ../proxies_sx_api_key)
export PROXIES_SX_WALLET=HauxDYg7G5wzhBR9x2TdteBxQsPJ66kqjunA5hvEQuMy
~/tools/gradle-8.10.2/bin/gradle :protocol:run \
  --args="--name kt-cli-test-01 --state ./peer_state.json"
```

First run registers a fresh device and writes `peer_state.json`. Subsequent
runs reuse it. Expected log progression:

1. `registering new device …` (first run only)
2. `connecting to wss://relay-…proxies.sx`
3. `ws open (subprotocol=token.eyJ…)`
4. `connected {"deviceId":"agent_…"}`
5. After ~15 min: `verified` / `probe_result` frames — device is now
   eligible for customer traffic.

## Wire format note

The official spec at <https://agents.proxies.sx/peer/skill.md> wraps every
relay message body in a `payload` field. The production `peer.js` does
**not** — it sends flat fields, and the live relay accepts them. This
Kotlin port follows `peer.js` for that reason. If the relay ever rejects
flat frames, wrap every `send(...)` JSON body in a `payload` object and
read every incoming `msg.optJSONObject("payload")` before extracting
fields.
