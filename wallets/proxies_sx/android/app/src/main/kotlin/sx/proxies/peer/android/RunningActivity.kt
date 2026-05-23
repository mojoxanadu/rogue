package sx.proxies.peer.android

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

// Status screen shown once the user taps Start in MainActivity. It does NOT
// own the service — PeerService is a Foreground Service that runs whether
// this activity (or the whole app) is in the foreground or not. This screen
// just observes PeerService's static state, polls it every second, and
// renders. Closing the screen has no effect on the service; the persistent
// notification is what keeps Android from killing it.
class RunningActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var stateText: TextView
    private lateinit var verifiedText: TextView
    private lateinit var deviceIdText: TextView
    private lateinit var lastLineText: TextView
    private lateinit var stopBtn: Button

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
        deviceIdText = findViewById(R.id.deviceId)
        lastLineText = findViewById(R.id.lastLine)
        stopBtn = findViewById(R.id.stop)

        stopBtn.setOnClickListener {
            PeerService.stop(this)
            // Bounce back to the form so the user can restart.
            startActivity(Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        }
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
        deviceIdText.text = "Device: ${PeerService.deviceId ?: "(registering…)"}"
        lastLineText.text = PeerService.latestStatus
    }
}
