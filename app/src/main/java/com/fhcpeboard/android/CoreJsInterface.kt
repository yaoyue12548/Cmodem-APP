package com.fhcpeboard.android

import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONObject

class CoreJsInterface(private val host: MainActivity) {
    private val tag = "FHCpeBoard"

    @JavascriptInterface
    fun assetRead(name: String): String {
        require(name in setOf("fhcpeweb.html", "device_address.js", "lan_ui.js", "air6_ui.js", "air6_automation.js", "sms_cards.js", "android_ui.css", "upstream_images.js", "lg6851f_image.js", "changelog.json"))
        return host.assets.open(name).bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    @JavascriptInterface
    fun kcGet(key: String): String = NativeStore.kcGet(key)

    @JavascriptInterface
    fun kcSet(key: String, value: String) {
        NativeStore.kcSet(key, value)
    }

    @JavascriptInterface
    fun kcRemove(key: String) {
        NativeStore.kcRemove(key)
    }

    @JavascriptInterface
    fun kcContains(key: String): Boolean = NativeStore.kcContains(key)

    @JavascriptInterface
    fun clearCaches(): Int = NativeStore.clearCaches()

    @JavascriptInterface
    fun fileDocsDir(): String = NativeStore.docsDir()

    @JavascriptInterface
    fun fileExists(path: String): Boolean = NativeStore.fileExists(path)

    @JavascriptInterface
    fun fileRead(path: String): String = NativeStore.fileRead(path)

    @JavascriptInterface
    fun fileWrite(path: String, content: String) {
        NativeStore.fileWrite(path, content)
    }

    @JavascriptInterface
    fun fileRemove(path: String) {
        NativeStore.fileRemove(path)
    }

    @JavascriptInterface
    fun log(msg: String) {
        if (BuildConfig.DEBUG) Log.i(tag, msg.take(1000))
    }

    @JavascriptInterface
    fun stringify(obj: String): String = obj

    @JavascriptInterface
    fun parse(text: String): String = text

    @JavascriptInterface
    fun themeDark(): Boolean = host.isDarkTheme()

    @JavascriptInterface
    fun fetch(id: String, url: String, optJson: String) {
        host.runOnIo {
            val result = HttpEngine.fetch(url, optJson)
            host.deliverFetch(id, result.status, result.text)
        }
    }

    @JavascriptInterface
    fun clearHttpSession(url: String) {
        HttpEngine.clearSession(url)
    }

    @JavascriptInterface
    fun evalJS(id: String, js: String) {
        host.evalOnBoard(id, js)
    }

    @JavascriptInterface
    fun loadHTML(id: String, html: String) {
        host.loadBoardHtml(id, html)
    }

    @JavascriptInterface
    fun nativePing(): String = JSONObject(
        mapOf(
            "ok" to true,
            "ver" to BuildConfig.VERSION_NAME,
            "nativeCore" to NativeCore.isAvailable(),
            "nativeCoreVersion" to NativeCore.version()
        )
    ).toString()

    @JavascriptInterface
    fun decodeSmsPdu(pdu: String): String = NativeCore.decodeSmsPdu(pdu).orEmpty()

    @JavascriptInterface
    fun reseed(): String {
        NativeStore.reseedFromAssets(force = true)
        return "ok"
    }
}
