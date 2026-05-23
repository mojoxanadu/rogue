package sx.proxies.peer.android

import android.app.*
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import sx.proxies.peer.PeerClient
import sx.proxies.peer.PeerState
import sx.proxies.peer.Registration
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

// Network signal grading for the RunningActivity traffic-light dot. Top-
// level (not nested in the companion) so it can be referenced from the
// Activity as `Signal.GREEN` without going through PeerService.Companion.
enum class Signal { UNKNOWN, RED, YELLOW, GREEN }

class PeerService : Service() {

    companion object {
        private const val CHAN_ID = "proxies-sx-peer"
        private const val NOTIF_ID = 1
        private const val API = "https://api.proxies.sx"
        const val EXTRA_API_KEY = "apiKey"
        const val EXTRA_WALLET = "wallet"
        const val EXTRA_NAME = "name"

        // Observed by RunningActivity to render live status without binding.
        @Volatile var isRunning: Boolean = false; private set
        @Volatile var isVerified: Boolean = false; private set
        // Named peerDeviceId (not deviceId) to avoid shadowing
        // Context.getDeviceId(): Int added in API 34.
        @Volatile var peerDeviceId: String? = null; private set
        @Volatile var latestStatus: String = "Stopped"; private set

        // Earnings, polled every 60 s by the service. earningsLine is a
        // pre-formatted display string; canPayout gates the payout button.
        @Volatile var earningsLine: String = "Earnings: (fetching…)"; private set
        @Volatile var canPayout: Boolean = false; private set

        // Network capability tracking — used for the traffic-light indicator
        // and the throughput readout in RunningActivity. Updated via a
        // NetworkCallback registered in onCreate. The platform's probe
        // threshold is ~500 KB/s = 4 Mbps; we color around that.
        @Volatile var netSignal: Signal = Signal.UNKNOWN; private set
        @Volatile var netDownKbps: Int = 0; private set
        @Volatile var netUpKbps: Int = 0; private set
        // Count of probe_result frames received this session. The relay's
        // exact schema isn't documented (peer.js logs them opaquely), but
        // each probe yields one frame, so the count is a reasonable proxy
        // for "how close are we to the 3-pass verification bar."
        @Volatile var probesSeen: Int = 0; private set

        // Held so the companion's payout helper can read a fresh JWT.
        // PeerClient mutates this PeerState in place on every refresh, so
        // the jwt field is always current.
        @Volatile private var currentState: PeerState? = null

        private val payoutHttp = OkHttpClient()
        private val payoutExec = Executors.newSingleThreadExecutor()
        private val mainHandler = Handler(Looper.getMainLooper())

        fun start(ctx: Context, apiKey: String?, wallet: String, name: String) {
            val i = Intent(ctx, PeerService::class.java).apply {
                putExtra(EXTRA_API_KEY, apiKey)
                putExtra(EXTRA_WALLET, wallet)
                putExtra(EXTRA_NAME, name)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
            else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, PeerService::class.java))
        }

        // POST /v1/peer/agents/{id}/withdraw. Result callback runs on the
        // main thread so the UI can show it directly.
        fun requestPayout(onResult: (String) -> Unit) {
            val id = peerDeviceId
            val jwt = currentState?.jwt
            if (id == null || jwt == null) {
                onResult("Not connected — start the service first."); return
            }
            payoutExec.submit {
                val text = try {
                    val req = Request.Builder()
                        .url("$API/v1/peer/agents/$id/withdraw")
                        .post("".toRequestBody(null))
                        .addHeader("Authorization", "Bearer $jwt")
                        .build()
                    payoutHttp.newCall(req).execute().use { res ->
                        val body = res.body?.string().orEmpty()
                        if (res.isSuccessful) "Payout requested.\n\n$body"
                        else "Payout failed (HTTP ${res.code}):\n$body"
                    }
                } catch (e: Exception) {
                    "Payout error: ${e.message}"
                }
                mainHandler.post { onResult(text) }
            }
        }
    }

    @Volatile private var client: PeerClient? = null
    @Volatile private var state: PeerState? = null
    private var earningsScheduler: ScheduledExecutorService? = null
    private val earningsHttp = OkHttpClient()

    private val netCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            netDownKbps = caps.linkDownstreamBandwidthKbps
            netUpKbps = caps.linkUpstreamBandwidthKbps
            // Grade each direction independently and take the worse one.
            // proxies.sx pays you to upload customer traffic, so upstream
            // is the binding constraint — a fat downstream doesn't help
            // if upload can't sustain the ~4 Mbps probe (≈500 KB/s).
            // A reported 0 means "unknown" (Wi-Fi often can't see the
            // upstream carrier behind the AP), so we ignore it instead
            // of treating it as failure.
            fun grade(kbps: Int): Signal = when {
                kbps <= 0      -> Signal.UNKNOWN
                kbps >= 8_000  -> Signal.GREEN
                kbps >= 4_000  -> Signal.YELLOW
                else           -> Signal.RED
            }
            val d = grade(netDownKbps)
            val u = grade(netUpKbps)
            // Worse-of-two, but UNKNOWN is treated as "no info" not as bad.
            netSignal = when {
                d == Signal.UNKNOWN && u == Signal.UNKNOWN -> Signal.UNKNOWN
                d == Signal.RED || u == Signal.RED         -> Signal.RED
                d == Signal.YELLOW || u == Signal.YELLOW   -> Signal.YELLOW
                else                                       -> Signal.GREEN
            }
        }
        override fun onLost(network: Network) {
            netSignal = Signal.RED; netDownKbps = 0; netUpKbps = 0
        }
    }

    override fun onCreate() {
        super.onCreate()
        LogStore.init(filesDir)
        LogStore.append("service onCreate")
        createChannel()
        isRunning = true
        isVerified = false
        latestStatus = "Starting…"
        earningsLine = "Earnings: (fetching…)"
        canPayout = false
        netSignal = Signal.UNKNOWN; netDownKbps = 0; netUpKbps = 0
        probesSeen = 0
        runCatching {
            val cm = getSystemService(ConnectivityManager::class.java)
            val req = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            cm.registerNetworkCallback(req, netCallback)
        }
        startForeground(NOTIF_ID, buildNotification())
    }

    override fun onDestroy() {
        LogStore.append("service onDestroy")
        runCatching {
            getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(netCallback)
        }
        runCatching { earningsScheduler?.shutdownNow() }
        earningsScheduler = null
        runCatching { client?.shutdown() }
        client = null
        state = null
        currentState = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION") stopForeground(true)
        }
        getSystemService(NotificationManager::class.java).cancel(NOTIF_ID)
        isRunning = false
        isVerified = false
        latestStatus = "Stopped"
        earningsLine = "Earnings: (stopped)"
        canPayout = false
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (client != null) return START_STICKY
        val stateFile = File(filesDir, "peer_state.json")
        Thread {
            try {
                val reg = Registration()
                val s = if (stateFile.exists()) {
                    PeerState.load(stateFile)
                } else {
                    val name = intent?.getStringExtra(EXTRA_NAME) ?: "android-peer"
                    val wallet = intent?.getStringExtra(EXTRA_WALLET).orEmpty()
                    val apiKey = intent?.getStringExtra(EXTRA_API_KEY)
                    require(wallet.isNotBlank()) { "wallet address required on first launch" }
                    reg.register(name = name, type = "claude", walletAddress = wallet, apiKey = apiKey)
                        .also { stateFile.writeText(it.toJson()) }
                }
                runCatching { reg.refresh(s); stateFile.writeText(s.toJson()) }
                state = s
                currentState = s
                peerDeviceId = s.deviceId
                val pc = PeerClient(stateFile, s, reg) { line ->
                    Log.i("PeerService", line)
                    LogStore.append(line)
                    latestStatus = line.take(120)
                    if (line.contains("probe_result")) probesSeen++
                    if (!isVerified && (line.contains("verified") || line.contains("probe_result"))) {
                        isVerified = true
                        updateNotification()
                    }
                }
                client = pc
                pc.start()
                startEarningsPolling(s)
            } catch (e: Exception) {
                Log.e("PeerService", "fatal", e)
                latestStatus = "Error: ${e.message}"
                stopSelf()
            }
        }.start()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // Polls GET /v1/peer/agents/{id}/earnings every 60 s on a dedicated
    // scheduler. Reads jwt fresh from the PeerState each tick (PeerClient
    // mutates it in place on refresh, so we never use a stale token).
    private fun startEarningsPolling(s: PeerState) {
        val sched = Executors.newSingleThreadScheduledExecutor()
        earningsScheduler = sched
        sched.scheduleAtFixedRate({
            val id = s.deviceId
            try {
                val req = Request.Builder()
                    .url("$API/v1/peer/agents/$id/earnings")
                    .addHeader("Authorization", "Bearer ${s.jwt}")
                    .build()
                earningsHttp.newCall(req).execute().use { res ->
                    val body = res.body?.string().orEmpty()
                    if (!res.isSuccessful) {
                        earningsLine = "Earnings: HTTP ${res.code}"
                        canPayout = false
                        LogStore.append("earnings poll HTTP ${res.code}: ${body.take(200)}")
                        return@scheduleAtFixedRate
                    }
                    val j = JSONObject(body)
                    // Schema isn't formally documented; pick the most
                    // likely fields and fall back to raw if missing.
                    val balance = j.optDouble("pendingUsd",
                        j.optDouble("balance",
                            j.optDouble("totalEarnings", Double.NaN)))
                    val paid = j.optDouble("paidUsd",
                        j.optDouble("paidTotal", Double.NaN))
                    canPayout = j.optBoolean("canRequestPayout", false)
                    earningsLine = buildString {
                        append("Earnings: ")
                        if (!balance.isNaN()) append("$%.4f pending".format(balance))
                        else append("(no balance field)")
                        if (!paid.isNaN()) append(" · $%.2f paid".format(paid))
                        if (canPayout) append(" · ready for payout")
                    }
                }
            } catch (e: Exception) {
                earningsLine = "Earnings: ${e.message?.take(60)}"
            }
        }, 5, 60, TimeUnit.SECONDS)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val chan = NotificationChannel(CHAN_ID, "Peer status", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(chan)
        }
    }

    private fun buildNotification(): Notification {
        val tap = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val text = if (isVerified) "Earning" else "Connecting / warming up"
        return Notification.Builder(this, CHAN_ID)
            .setSmallIcon(if (isVerified) R.drawable.ic_dollar else R.drawable.ic_hourglass)
            .setContentTitle("Proxies.sx peer")
            .setContentText(text)
            .setContentIntent(tap)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification() {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification())
    }
}
