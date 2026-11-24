import Foundation

struct WidgetSnapshot: Codable {
    static let kind = "CmodemOverview"
    var id: String
    var name: String
    var sampledAt: Date?
    var fields: [String: String] = [:]

    private static var file: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.fhcpeboard.ios")?
            .appendingPathComponent("overview.json")
    }
    static func read() -> WidgetSnapshot? {
        guard let file, let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(Self.self, from: data)
    }
    func write() -> Bool {
        guard let file else { return false }
        do {
            try JSONEncoder().encode(self).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch { return false }
    }
    subscript(_ key: String) -> String {
        guard let value = fields[key], !["", "-", "--"].contains(value) else { return "—" }
        return value
    }
}
