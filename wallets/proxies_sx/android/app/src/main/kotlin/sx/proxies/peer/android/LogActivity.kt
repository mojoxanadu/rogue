package sx.proxies.peer.android

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider

class LogActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var logText: TextView
    private lateinit var scroll: ScrollView

    // Re-render every 2 s so a user watching live can see new lines
    // appear. Cheaper than a file-observer and 2 s lag is fine for
    // human-paced reading. Cancelled in onPause.
    private val refresh = object : Runnable {
        override fun run() {
            render(); handler.postDelayed(this, 2000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_log)
        scroll = findViewById(R.id.logScroll)
        logText = findViewById(R.id.logText)
        findViewById<Button>(R.id.share).setOnClickListener { share() }
        findViewById<Button>(R.id.copy).setOnClickListener { copy() }
    }

    override fun onResume() { super.onResume(); handler.post(refresh) }
    override fun onPause() { super.onPause(); handler.removeCallbacks(refresh) }

    private fun render() {
        val wasAtBottom = scroll.canScrollVertically(1).not()
        logText.text = LogStore.snapshot()
        // Auto-scroll only if user was already at the bottom — don't
        // yank them away from a line they're trying to read.
        if (wasAtBottom) scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    private fun share() {
        val f = LogStore.exportFile()
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", f)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "Proxies.sx peer log")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(send, "Send log via…"))
    }

    private fun copy() {
        val cm = getSystemService(android.content.ClipboardManager::class.java)
        cm.setPrimaryClip(android.content.ClipData.newPlainText("peer log", LogStore.snapshot()))
    }
}
