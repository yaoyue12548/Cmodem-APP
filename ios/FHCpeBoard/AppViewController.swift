import UIKit
import WebKit
import PhotosUI
import Security
import Darwin

final class AppViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, PHPickerViewControllerDelegate, URLSessionTaskDelegate {
    private let keychainService = "com.fhcpeboard.ios"
    private let preferencePrefix = "com.fhcpeboard.ios."
    private var keychain: [String: String] = [:]
    private var preferences: [String: String] = [:]
    private var assets: [String: String] = [:]
    private var coreHTML = ""
    private var board: WKWebView!
    private var core: WKWebView!
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.connectionProxyDictionary = [:]
        config.timeoutIntervalForRequest = 45
        config.timeoutIntervalForResource = 60
        config.httpCookieStorage = .shared
        config.httpShouldSetCookies = true
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        loadKeychain()
        loadAssets()
        let controller = WKUserContentController()
        controller.add(self, name: "core")
        let bootstrap = "window.__iosKeychain=\(json(keychain));window.__iosPreferences=\(json(preferences));window.__iosAssets=\(json(assets));"
        controller.addUserScript(WKUserScript(source: bootstrap, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        core = WKWebView(frame: .zero, configuration: config)
        core.navigationDelegate = self
        core.uiDelegate = self
        core.isHidden = true
        view.addSubview(core)
        core.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            core.widthAnchor.constraint(equalToConstant: 1), core.heightAnchor.constraint(equalToConstant: 1),
            core.leadingAnchor.constraint(equalTo: view.leadingAnchor), core.topAnchor.constraint(equalTo: view.topAnchor)
        ])

        let boardController = WKUserContentController()
        boardController.add(self, name: "core")
        let boardBootstrap = "window.__iosKeychain=\(json(keychain));window.AndroidBoard={uiFlavor:()=> 'default',wifiCacheGet:s=>window.__iosKeychain['UPSTREAM_LOCAL_WIFI_CACHE_'+s]||'',wifiCacheSet:(s,v)=>{window.__iosKeychain['UPSTREAM_LOCAL_WIFI_CACHE_'+s]=v;window.webkit.messageHandlers.core.postMessage({action:'keychainSet',key:'UPSTREAM_LOCAL_WIFI_CACHE_'+s,value:v})},pickWallpaper:()=>window.webkit.messageHandlers.core.postMessage({action:'pickWallpaper'}),postMessage:j=>window.webkit.messageHandlers.core.postMessage({action:'pageMessage',json:typeof j==='string'?j:JSON.stringify(j)})};"
        boardController.addUserScript(WKUserScript(source: boardBootstrap, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        let boardConfig = WKWebViewConfiguration()
        boardConfig.userContentController = boardController
        board = WKWebView(frame: .zero, configuration: boardConfig)
        board.navigationDelegate = self
        board.uiDelegate = self
        board.scrollView.contentInsetAdjustmentBehavior = .never
        view.insertSubview(board, belowSubview: core)
        board.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            board.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            board.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            board.topAnchor.constraint(equalTo: view.topAnchor), board.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        NotificationCenter.default.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
        loadCore()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        core.evaluateJavaScript("window.__lanActive&&window.__lanActive(true)")
    }

    @objc private func didEnterBackground() {
        core.evaluateJavaScript("window.__lanActive&&window.__lanActive(false)")
    }

    @objc private func willEnterForeground() {
        core.evaluateJavaScript("window.__lanActive&&window.__lanActive(true)")
        board.evaluateJavaScript("window.__lanRestoreVisuals&&window.__lanRestoreVisuals()")
    }

    private func loadAssets() {
        let names = ["fhcpeweb.html", "device_address.js", "lan_ui.js", "air6_ui.js", "air6_automation.js", "sms_cards.js", "android_ui.css", "upstream_images.js", "changelog.json", "network_mode.js", "upstream_local.js", "air6_api.js", "lan_api.js", "lan_runtime.js"]
        for name in names {
            let base = URL(fileURLWithPath: Bundle.main.resourcePath ?? "")
            let candidates = [base.appendingPathComponent(name), base.appendingPathComponent("assets/\(name)")]
            if let url = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }),
               let value = try? String(contentsOf: url, encoding: .utf8) { assets[name] = value }
        }
    }

    private func loadCore() {
        let base = URL(fileURLWithPath: Bundle.main.resourcePath ?? "")
        let candidates = [base.appendingPathComponent("core.html"), base.appendingPathComponent("assets/core.html")]
        guard let url = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            showError("应用资源加载失败，请重新安装应用。")
            return
        }
        coreHTML = source
        for name in ["network_mode.js", "device_address.js", "upstream_local.js", "air6_api.js", "lan_api.js", "lan_runtime.js"] {
            coreHTML = coreHTML.replacingOccurrences(of: "<script src=\"\(name)\"></script>", with: "<script>\(assets[name] ?? "")</script>")
        }
        core.loadHTMLString(coreHTML, baseURL: URL(string: "https://fhcpeboard.local/"))
    }

    private func showError(_ message: String) {
        let label = UILabel()
        label.text = message
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = .secondaryLabel
        view.addSubview(label)
        label.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24), label.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "keychainSet":
            if let key = body["key"] as? String, let value = body["value"] as? String { keychainSet(value, account: key) }
        case "keychainRemove":
            if let key = body["key"] as? String { keychainRemove(account: key) }
        case "preferenceSet":
            if let key = body["key"] as? String, let value = body["value"] as? String { preferences[key] = value; UserDefaults.standard.set(value, forKey: preferencePrefix + key) }
        case "preferenceRemove":
            if let key = body["key"] as? String { preferences.removeValue(forKey: key); UserDefaults.standard.removeObject(forKey: preferencePrefix + key) }
        case "clearCaches":
            let keys = keychain.keys.filter { $0.localizedCaseInsensitiveContains("cache") || $0.localizedCaseInsensitiveContains("cached_data") }
            keys.forEach { keychainRemove(account: $0) }
            let savedKeys = preferences.keys.filter { $0.localizedCaseInsensitiveContains("cache") || $0.localizedCaseInsensitiveContains("cached_data") }
            savedKeys.forEach { preferences.removeValue(forKey: $0); UserDefaults.standard.removeObject(forKey: preferencePrefix + $0) }
        case "decodeSmsPdu":
            guard let id = body["id"] as? String, let pdu = body["pdu"] as? String else { return }
            var output = [CChar](repeating: 0, count: 32768)
            let decoded = pdu.withCString { fhcpe_decode_sms_pdu($0, &output, output.count) }
            let result = decoded > 0 ? String(cString: output) : ""
            let encoded = json(result)
            core.evaluateJavaScript("window.__nativeDone(\(json(json(["id": id, "result": encoded]))))")
        case "keychainSnapshot":
            break
        case "fetch":
            fetch(body)
        case "clearHttpSession":
            if let raw = body["url"] as? String, let host = URL(string: raw)?.host {
                HTTPCookieStorage.shared.cookies?.filter { $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).caseInsensitiveCompare(host) == .orderedSame }.forEach(HTTPCookieStorage.shared.deleteCookie)
            }
        case "evalJS":
            guard let id = body["id"] as? String, let code = body["js"] as? String else { return }
            board.evaluateJavaScript(code) { [weak self] value, _ in
                self?.complete(id, result: value.map { self?.json($0) ?? "null" } ?? "null")
            }
        case "loadHTML":
            guard let id = body["id"] as? String, let html = body["html"] as? String else { return }
            board.loadHTMLString(html, baseURL: URL(string: "https://fhcpeboard.local/"))
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in self?.complete(id, result: "true") }
        case "pageMessage":
            if let raw = body["json"] as? String { forwardMessage(raw) }
        case "pickWallpaper":
            var config = PHPickerConfiguration(photoLibrary: .shared())
            config.filter = .images
            config.selectionLimit = 1
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            present(picker, animated: true)
        default: break
        }
    }

    private func fetch(_ body: [String: Any]) {
        guard let id = body["id"] as? String, let raw = body["url"] as? String,
              let url = URL(string: raw), validDeviceURL(url) else {
            if let id = body["id"] as? String { deliver(id, status: 403, text: "DEVICE_ADDRESS_REJECTED") }
            return
        }
        let options: [String: Any]
        if let value = body["options"] as? [String: Any] { options = value }
        else if let rawOptions = body["options"] as? String,
                let data = rawOptions.data(using: .utf8),
                let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { options = value }
        else { options = [:] }
        var request = URLRequest(url: url, timeoutInterval: min(max((options["timeoutMs"] as? Double ?? 45000) / 1000, 1), 45))
        let method = (options["method"] as? String ?? "GET").uppercased()
        request.httpMethod = method
        let headers = options["headers"] as? [String: String] ?? [:]
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        if request.value(forHTTPHeaderField: "Accept") == nil { request.setValue("*/*", forHTTPHeaderField: "Accept") }
        if let value = options["body"], !(value is NSNull) {
            request.httpBody = (value as? String ?? String(describing: value)).data(using: .utf8)
        }
        session.dataTask(with: request) { [weak self] data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let text = error == nil ? String(data: data ?? Data(), encoding: .utf8) ?? "" : Self.networkReason(error!)
            let decoded = error == nil ? self?.decodePdus(in: text) ?? [:] : [:]
            self?.deliver(id, status: status, text: text, decodedPdus: decoded)
        }.resume()
    }

    private func validDeviceURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme), url.user == nil, url.password == nil,
              let rawHost = url.host else { return false }
        let host = rawHost.trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        guard !host.isEmpty else { return false }
        let lower = host.lowercased()
        if lower == "localhost" || lower.hasSuffix(".localhost") { return false }
        if let ip = IPv4(host) { return ip[0] != 0 && ip[0] != 127 && ip[0] < 224 && !(ip[0] == 169 && ip[1] == 254) }
        if lower.contains(":" ) { return validIPv6(lower) }
        guard lower.contains("."), !lower.hasSuffix("."), dnsAddressesAreUsable(lower) else { return false }
        return true
    }

    private func validIPv6(_ host: String) -> Bool {
        var address = in6_addr()
        guard host.withCString({ inet_pton(AF_INET6, $0, &address) }) == 1 else { return false }
        let bytes = withUnsafeBytes(of: address) { Array($0) }
        if bytes.allSatisfy({ $0 == 0 }) || (bytes.dropLast().allSatisfy({ $0 == 0 }) && bytes.last == 1) { return false }
        if bytes[0] == 0xff || (bytes[0] == 0xfe && bytes[1] & 0xc0 == 0x80) { return false }
        if bytes[0..<10].allSatisfy({ $0 == 0 }) && bytes[10] == 0xff && bytes[11] == 0xff { return false }
        return true
    }

    private func dnsAddressesAreUsable(_ host: String) -> Bool {
        var hints = addrinfo()
        hints.ai_flags = AI_ADDRCONFIG
        hints.ai_family = AF_UNSPEC
        hints.ai_socktype = SOCK_STREAM
        var result: UnsafeMutablePointer<addrinfo>?
        guard getaddrinfo(host, nil, &hints, &result) == 0, let first = result else { return false }
        defer { freeaddrinfo(first) }
        var item: UnsafeMutablePointer<addrinfo>? = first
        var usable = false
        while let current = item {
            if current.pointee.ai_family == AF_INET, let address = current.pointee.ai_addr?.withMemoryRebound(to: sockaddr_in.self, capacity: 1, { $0.pointee.sin_addr.s_addr }) {
                let value = UInt32(bigEndian: address)
                let octets = [(value >> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255]
                if octets[0] != 0 && octets[0] != 127 && octets[0] < 224 && !(octets[0] == 169 && octets[1] == 254) { usable = true }
            } else if current.pointee.ai_family == AF_INET6, let address = current.pointee.ai_addr?.withMemoryRebound(to: sockaddr_in6.self, capacity: 1, { $0.pointee.sin6_addr }) {
                let bytes = withUnsafeBytes(of: address) { Array($0) }
                let loopback = bytes.allSatisfy({ $0 == 0 }) || (bytes.dropLast().allSatisfy({ $0 == 0 }) && bytes.last == 1)
                let linkLocal = bytes[0] == 0xfe && bytes[1] & 0xc0 == 0x80
                if !loopback && bytes[0] != 0xff && !linkLocal { usable = true }
            }
            item = current.pointee.ai_next
        }
        return usable
    }

    private func IPv4(_ host: String) -> [Int]? {
        let parts = host.split(separator: ".")
        guard parts.count == 4 else { return nil }
        let values = parts.compactMap { Int($0) }
        return values.count == 4 && values.allSatisfy({ (0...255).contains($0) }) ? values : nil
    }

    private static func networkReason(_ error: Error) -> String {
        let code = (error as NSError).code
        if code == -1202 || code == -1200 { return "TLS_CERT_FAILED" }
        if code == -1003 { return "DNS_FAILED" }
        if code == -1022 { return "TLS_FAILED" }
        return ""
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    private func deliver(_ id: String, status: Int, text: String) {
        deliver(id, status: status, text: text, decodedPdus: [:])
    }

    private func deliver(_ id: String, status: Int, text: String, decodedPdus: [String: String]) {
        let script = "window.__iosPduDecoded=\(json(decodedPdus));window.__fetchText(\(json(id)),\(status),\(json(text)))"
        DispatchQueue.main.async { [weak self] in self?.core.evaluateJavaScript(script) }
    }

    private func decodePdus(in text: String) -> [String: String] {
        guard let data = text.data(using: .utf8), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let messages = root["messages"] else { return [:] }
        let items: [[String: Any]]
        if let array = messages as? [[String: Any]] { items = array }
        else if let dictionary = messages as? [String: [String: Any]] { items = Array(dictionary.values) }
        else { return [:] }
        return items.reduce(into: [:]) { result, item in
            guard let pdu = item["pdu"] as? String, !pdu.isEmpty else { return }
            let decoded = decodeSmsPdu(pdu)
            if !decoded.isEmpty { result[pdu] = decoded }
        }
    }

    private func decodeSmsPdu(_ pdu: String) -> String {
        guard pdu.count >= 8, pdu.count <= 8192 else { return "" }
        var output = [CChar](repeating: 0, count: 32768)
        let count = pdu.withCString { input in
            output.withUnsafeMutableBufferPointer { buffer in
                fhcpe_decode_sms_pdu(input, buffer.baseAddress, buffer.count)
            }
        }
        return count > 0 ? String(cString: output) : ""
    }

    private func complete(_ id: String, result: String) {
        let payload = json(["id": id, "result": result])
        DispatchQueue.main.async { [weak self] in self?.core.evaluateJavaScript("window.__nativeDone(\(self?.json(payload) ?? "{}"))") }
    }

    private func forwardMessage(_ raw: String) {
        let literal = json(raw)
        DispatchQueue.main.async { [weak self] in self?.core.evaluateJavaScript("window.__onPageMessage(\(literal))") }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.host == "fhcpeboard.local" || url.scheme == "about" { decisionHandler(.allow) }
        else { decisionHandler(.cancel) }
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        dismiss(animated: true)
        guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else { return }
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            guard let image = object as? UIImage, let data = image.jpegData(compressionQuality: 0.88), let self else { return }
            let encoded = data.base64EncodedString()
            DispatchQueue.main.async {
                let source = "window.__iosImagePicked&&window.__iosImagePicked(\(self.json(encoded)))"
                self.board.evaluateJavaScript(source)
            }
        }
    }

    private func loadKeychain() {
        preferences = UserDefaults.standard.dictionaryRepresentation().reduce(into: [:]) { result, item in
            guard item.key.hasPrefix(preferencePrefix), let value = item.value as? String else { return }
            result[String(item.key.dropFirst(preferencePrefix.count))] = value
        }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecReturnAttributes as String: true, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitAll]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let items = result as? [[String: Any]] else { return }
        for item in items {
            if let account = item[kSecAttrAccount as String] as? String, let data = item[kSecValueData as String] as? Data, let value = String(data: data, encoding: .utf8) { keychain[account] = value }
        }
    }

    private func keychainSet(_ value: String, account: String) {
        keychain[account] = value
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecAttrAccount as String: account]
        let data = Data(value.utf8)
        if SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess { SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) }
        else { SecItemAdd((query.merging([kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]) { _, new in new }) as CFDictionary, nil) }
    }

    private func keychainRemove(account: String) {
        keychain.removeValue(forKey: account)
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecAttrAccount as String: account] as CFDictionary)
    }

    private func json(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(value) || value is String else { return "null" }
        let data = (value is String ? try? JSONSerialization.data(withJSONObject: [value], options: [.fragmentsAllowed]) : try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])) ?? Data("null".utf8)
        let encoded = String(data: data, encoding: .utf8) ?? "null"
        return value is String ? String(encoded.dropFirst().dropLast()) : encoded
    }
}
