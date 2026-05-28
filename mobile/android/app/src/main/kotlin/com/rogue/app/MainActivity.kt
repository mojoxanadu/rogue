package com.rogue.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

  private lateinit var webView: WebView

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)

    webView = findViewById(R.id.webview)

    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      allowFileAccess = true
      loadWithOverviewMode = true
      useWideViewPort = true
      builtInZoomControls = true
      displayZoomControls = false
      mediaPlaybackRequiresUserGesture = false
    }

    webView.webChromeClient = WebChromeClient()
    webView.webViewClient = WebViewClient()

    // Forces the game's touch-detection to activate on all Android devices
    // (some WebView implementations don't report maxTouchPoints reliably).
    webView.evaluateJavascript(
      """
      (function() {
        window.IS_TOUCH = true;
        document.documentElement.classList.add('touch');
      })()
      """.trimIndent(),
      null
    )

    webView.loadUrl("file:///android_asset/index.html")
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
      webView.goBack()
      return true
    }
    return super.onKeyDown(keyCode, event)
  }
}
