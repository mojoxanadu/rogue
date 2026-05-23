package sx.proxies.peer.android

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: SharedPreferences

    // Pending start params, captured at the Start tap. If we have to wait
    // for the notification-permission dialog, we replay this in the result
    // callback. Without this, the old code raced the dialog against the
    // service start — granting too late, or denying, both produced a
    // running-but-invisible service (Android 13+ suppresses the foreground
    // notification when POST_NOTIFICATIONS is denied).
    private var pendingStart: (() -> Unit)? = null

    private val notifPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                pendingStart?.invoke()
                pendingStart = null
            } else {
                showPermissionRequiredDialog()
                pendingStart = null
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (PeerService.isRunning) {
            startActivity(Intent(this, RunningActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_main)
        prefs = getSharedPreferences("peer", Context.MODE_PRIVATE)

        val nameEdit = findViewById<EditText>(R.id.name)
        val walletEdit = findViewById<EditText>(R.id.wallet)
        val apiKeyEdit = findViewById<EditText>(R.id.apiKey)
        val startBtn = findViewById<Button>(R.id.start)
        val stopBtn = findViewById<Button>(R.id.stop)
        val status = findViewById<TextView>(R.id.status)

        nameEdit.setText(prefs.getString("name", "android-peer-01"))
        walletEdit.setText(prefs.getString("wallet", "HauxDYg7G5wzhBR9x2TdteBxQsPJ66kqjunA5hvEQuMy"))
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

            val startAction = {
                PeerService.start(
                    this,
                    apiKey = apiKeyEdit.text.toString().ifBlank { null },
                    wallet = walletEdit.text.toString().trim(),
                    name = nameEdit.text.toString().trim(),
                )
                startActivity(Intent(this, RunningActivity::class.java))
                finish()
            }

            withNotificationPermission(startAction)
        }

        stopBtn.setOnClickListener {
            PeerService.stop(this)
            status.text = "Service stopped."
        }
    }

    // Runs `action` only after we're sure POST_NOTIFICATIONS is granted.
    // Three branches: already granted (go), can prompt (defer to the
    // permission-result callback), permanently denied (dialog → Settings).
    private fun withNotificationPermission(action: () -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            action(); return
        }
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) { action(); return }

        // shouldShowRequestPermissionRationale is true when Android will
        // actually show the system prompt. It's false in two cases: we've
        // never asked (first run — prompt still appears) and the user
        // tapped "Don't ask again" (prompt is suppressed forever).
        // We can't distinguish those two without remembering ourselves, so
        // we use a "have we asked yet" pref flag.
        val askedBefore = prefs.getBoolean("notifPermAsked", false)
        val canPrompt = !askedBefore ||
            shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)

        if (canPrompt) {
            pendingStart = action
            prefs.edit().putBoolean("notifPermAsked", true).apply()
            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            showPermissionRequiredDialog()
        }
    }

    private fun showPermissionRequiredDialog() {
        AlertDialog.Builder(this)
            .setTitle("Notifications required")
            .setMessage(
                "The peer runs as a Foreground Service, which Android requires " +
                "to show an ongoing notification. Without notification " +
                "permission the service runs invisibly and you have no way to " +
                "see status or stop it. Please enable Notifications for this " +
                "app, then tap Start again."
            )
            .setPositiveButton("Open settings") { _, _ ->
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        .setData(Uri.fromParts("package", packageName, null))
                )
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
