package sx.proxies.peer.android

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class RunningActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var stateText: TextView
    private lateinit var verifiedText: TextView
    private lateinit var signalDot: TextView
    private lateinit var throughputText: TextView
    private lateinit var probeCountText: TextView
    private lateinit var deviceIdText: TextView
    private lateinit var earningsText: TextView
    private lateinit var lastLineText: TextView
    private lateinit var stopBtn: Button
    private lateinit var payoutBtn: Button
    private lateinit var tipsBox: LinearLayout

    private val refresh = object : Runnable {
        override fun run() {
            render()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_running)
        stateText = findViewById(R.id.state)
        verifiedText = findViewById(R.id.verified)
        signalDot = findViewById(R.id.signalDot)
        throughputText = findViewById(R.id.throughput)
        probeCountText = findViewById(R.id.probeCount)
        deviceIdText = findViewById(R.id.deviceId)
        earningsText = findViewById(R.id.earnings)
        lastLineText = findViewById(R.id.lastLine)
        stopBtn = findViewById(R.id.stop)
        payoutBtn = findViewById(R.id.payout)
        tipsBox = findViewById(R.id.tips)

        stopBtn.setOnClickListener {
            PeerService.stop(this)
            startActivity(Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }

        payoutBtn.setOnClickListener { onPayoutTapped() }
    }

    override fun onResume() {
        super.onResume()
        handler.post(refresh)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(refresh)
    }

    private fun render() {
        val running = PeerService.isRunning
        val verified = PeerService.isVerified
        stateText.text = when {
            !running -> "Service stopped"
            verified -> "Earning — peer verified for customer traffic"
            else -> "Connecting / warming up (verification takes ~15 min)"
        }
        verifiedText.text = if (verified) "✓ Verified" else "⏳ Not yet verified"

        // Traffic-light dot + throughput readout. Color reflects whether
        // the current link can sustain the platform's ~4 Mbps probe.
        signalDot.setTextColor(when (PeerService.netSignal) {
            Signal.GREEN   -> 0xFF2ECC40.toInt()
            Signal.YELLOW  -> 0xFFFFB000.toInt()
            Signal.RED     -> 0xFFE74C3C.toInt()
            Signal.UNKNOWN -> 0xFF888888.toInt()
        })
        val down = PeerService.netDownKbps
        val up = PeerService.netUpKbps
        throughputText.text = if (down <= 0 && up <= 0) "—"
            else "%.1f↓ %.1f↑ Mbps".format(down / 1000.0, up / 1000.0)

        probeCountText.text = if (verified) "" else
            "Probes received: ${PeerService.probesSeen} (need ~3 consecutive passes)"

        deviceIdText.text = "Device: ${PeerService.peerDeviceId ?: "(registering…)"}"
        earningsText.text = PeerService.earningsLine
        lastLineText.text = PeerService.latestStatus
        tipsBox.visibility = if (verified) View.GONE else View.VISIBLE
        payoutBtn.isEnabled = PeerService.canPayout
    }

    // Confirm before firing the withdraw call — payouts cost network fees
    // platform-side and a misclick should be hard.
    private fun onPayoutTapped() {
        AlertDialog.Builder(this)
            .setTitle("Request payout?")
            .setMessage(
                "This will POST /v1/peer/agents/{id}/withdraw and ask " +
                "proxies.sx to send your pending USDC to the wallet you " +
                "registered with. The platform's stated minimum is \$5. " +
                "Proceed?"
            )
            .setPositiveButton("Request payout") { _, _ ->
                payoutBtn.isEnabled = false
                PeerService.requestPayout { result ->
                    AlertDialog.Builder(this)
                        .setTitle("Payout result")
                        .setMessage(result)
                        .setPositiveButton("OK", null)
                        .show()
                    payoutBtn.isEnabled = PeerService.canPayout
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
