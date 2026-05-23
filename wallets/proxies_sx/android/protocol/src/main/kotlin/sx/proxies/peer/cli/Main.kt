package sx.proxies.peer.cli

import sx.proxies.peer.PeerClient
import sx.proxies.peer.PeerState
import sx.proxies.peer.Registration
import java.io.File

// CLI test harness. On first run: registers a new device using the API key
// from PROXIES_SX_API_KEY env var (or --api-key) and walletAddress from
// PROXIES_SX_WALLET, persists state to ./peer_state.json, then connects.
// On subsequent runs: loads peer_state.json and reconnects.
//
//   PROXIES_SX_API_KEY=psx_... PROXIES_SX_WALLET=Haux... \
//     ./gradlew :protocol:run --args="--name kt-test-01 --state ./peer_state.json"

fun main(args: Array<String>) {
    val argMap = args.toList().zipWithNext().filter { it.first.startsWith("--") }
        .associate { it.first.removePrefix("--") to it.second }

    val stateFile = File(argMap["state"] ?: "peer_state.json")
    val reg = Registration()

    val state = if (stateFile.exists()) {
        println("loading state from ${stateFile.absolutePath}")
        PeerState.load(stateFile)
    } else {
        val name = argMap["name"] ?: error("--name required on first run")
        val wallet = System.getenv("PROXIES_SX_WALLET")
            ?: error("PROXIES_SX_WALLET env var required on first run")
        val apiKey = System.getenv("PROXIES_SX_API_KEY")
        println("registering new device '$name' -> $wallet")
        val s = reg.register(name = name, type = "claude", walletAddress = wallet, apiKey = apiKey)
        stateFile.writeText(s.toJson())
        println("registered: deviceId=${s.deviceId} relay=${s.relay}")
        s
    }

    // Refresh JWT once at startup in case the cached one is stale.
    runCatching { reg.refresh(state); stateFile.writeText(state.toJson()) }
        .onFailure { println("startup refresh failed: ${it.message}") }

    PeerClient(stateFile, state, reg).start()

    // Keep the main thread alive forever.
    Thread.currentThread().join()
}
