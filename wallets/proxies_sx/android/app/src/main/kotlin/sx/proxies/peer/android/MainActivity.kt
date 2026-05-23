package sx.proxies.peer.android

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = getSharedPreferences("peer", Context.MODE_PRIVATE)

        val nameEdit = findViewById<EditText>(R.id.name)
        val walletEdit = findViewById<EditText>(R.id.wallet)
        val apiKeyEdit = findViewById<EditText>(R.id.apiKey)
        val startBtn = findViewById<Button>(R.id.start)
        val stopBtn = findViewById<Button>(R.id.stop)
        val status = findViewById<TextView>(R.id.status)

        nameEdit.setText(prefs.getString("name", "android-peer-01"))
        walletEdit.setText(prefs.getString("wallet", ""))
        apiKeyEdit.setText(prefs.getString("apiKey", ""))

        val stateFile = File(filesDir, "peer_state.json")
        if (stateFile.exists()) {
            status.text = "Registered. Tap Start to connect."
            walletEdit.visibility = View.GONE
            apiKeyEdit.visibility = View.GONE
            nameEdit.isEnabled = false
        }

        startBtn.setOnClickListener {
            prefs.edit()
                .putString("name", nameEdit.text.toString())
                .putString("wallet", walletEdit.text.toString())
                .putString("apiKey", apiKeyEdit.text.toString())
                .apply()
            ensureNotificationPermission()
            PeerService.start(
                this,
                apiKey = apiKeyEdit.text.toString().ifBlank { null },
                wallet = walletEdit.text.toString().trim(),
                name = nameEdit.text.toString().trim(),
            )
            status.text = "Service started — check the notification."
        }

        stopBtn.setOnClickListener {
            PeerService.stop(this)
            status.text = "Service stopped."
        }
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS), 100)
            }
        }
    }
}
