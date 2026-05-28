# Keep WebView JS interface methods accessible
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
