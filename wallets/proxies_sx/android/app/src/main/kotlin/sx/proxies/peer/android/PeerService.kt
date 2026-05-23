package sx.proxies.peer.android

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import sx.proxies.peer.PeerClient
import sx.proxies.peer.PeerState
import sx.proxies.peer.Registration
import java.io.File

class PeerService : Service() {

    companion object {
        private const val CHAN_ID = "proxies-sx-peer"
        private const val NOTIF_ID = 1
        const val EXTRA_API_KEY = "apiKey"
        const val EXTRA_WALLET = "wallet"
        const val EXTRA_NAME = "name"

        // Observed by RunningActivity to render live status without binding.
        @Volatile var isRunning: Boolean = false; private set
        @Volatile var isVerified: Boolean = false; private set
        @Volatile var deviceId: String? = null; private set
        @Volatile var latestStatus: String = "Stopped"; private set

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
    }

    @Volatile private var client: PeerClient? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        isRunning = true
        isVerified = false
        latestStatus = "Starting…"
        startForeground(NOTIF_ID, buildNotification("Starting…"))
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        isVerified = false
        latestStatus = "Stopped"
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (client != null) return START_STICKY
        val stateFile = File(filesDir, "peer_state.json")
        Thread {
            try {
                val reg = Registration()
                val state = if (stateFile.exists()) {
                    PeerState.load(stateFile)
                } else {
                    val name = intent?.getStringExtra(EXTRA_NAME) ?: "android-peer"
                    val wallet = intent?.getStringExtra(EXTRA_WALLET).orEmpty()
                    val apiKey = intent?.getStringExtra(EXTRA_API_KEY)
                    require(wallet.isNotBlank()) { "wallet address required on first launch" }
                    reg.register(name = name, type = "claude", walletAddress = wallet, apiKey = apiKey)
                        .also { stateFile.writeText(it.toJson()) }
                }
                runCatching { reg.refresh(state); stateFile.writeText(state.toJson()) }
                updateNotification("Connecting to ${state.relay}")
                deviceId = state.deviceId
                val pc = PeerClient(stateFile, state, reg) { line ->
                    Log.i("PeerService", line)
                    if (!isVerified && (line.contains("verified") || line.contains("probe_result"))) {
                        isVerified = true
                    }
                    latestStatus = line.take(120)
                    updateNotification(line.take(80))
                }
                client = pc
                pc.start()
            } catch (e: Exception) {
                Log.e("PeerService", "fatal", e)
                updateNotification("Error: ${e.message}")
                stopSelf()
            }
        }.start()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val chan = NotificationChannel(CHAN_ID, "Peer status", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(chan)
        }
    }

    private fun buildNotification(text: String): Notification {
        val tap = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return Notification.Builder(this, CHAN_ID)
            .setSmallIcon(if (isVerified) R.drawable.ic_dollar else R.drawable.ic_hourglass)
            .setContentTitle("Proxies.sx peer")
            .setContentText(text)
            .setContentIntent(tap)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID, buildNotification(text))
    }
}
