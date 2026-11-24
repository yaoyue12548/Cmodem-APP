import SwiftUI
import WidgetKit

private struct Reading: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

private struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Reading {
        Reading(date: Date(), snapshot: WidgetSnapshot(id: "preview", name: "Cmodem", sampledAt: Date(),
                fields: ["operator":"Cmodem", "mode":"5G SA", "primaryBand":"N78", "rsrp":"-85", "sinr":"20"]))
    }
    func getSnapshot(in context: Context, completion: @escaping (Reading) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : Reading(date: Date(), snapshot: WidgetSnapshot.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Reading>) -> Void) {
        let now = Date()
        completion(Timeline(entries: [Reading(date: now, snapshot: WidgetSnapshot.read())], policy: .after(now.addingTimeInterval(900))))
    }
}

private struct Overview: View {
    let entry: Reading
    @Environment(\.widgetFamily) private var family
    private var compact: Bool { family == .systemSmall }
    private var large: Bool { family == .systemLarge }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content().padding(.horizontal, compact ? 7 : 10).padding(.vertical, 5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
    private func color(_ value: String, low: Double, good: Double) -> Color {
        guard let number = Double(value) else { return .secondary }
        return number >= good ? .green : number >= low ? .orange : .red
    }
    private func traffic(_ s: WidgetSnapshot, _ period: String) -> String {
        guard let rx = Double(s[period+"RxToday"]), let tx = Double(s[period+"TxToday"]), rx >= 0, tx >= 0 else { return "—" }
        let mb = rx+tx
        return mb >= 1024 ? String(format:"%.1f GB", mb/1024) : String(format:"%.0f MB", mb)
    }
    private func signalRow(_ label: String, _ text: String, _ range: ClosedRange<Double>, _ tint: Color) -> some View {
        HStack(spacing: 4) {
            Text(label).foregroundStyle(.secondary)
            ProgressView(value: min(1,max(0,((Double(text) ?? range.lowerBound)-range.lowerBound)/(range.upperBound-range.lowerBound)))).tint(tint)
            Text(text).monospacedDigit().frame(minWidth: 22, alignment: .trailing)
        }.font(.caption2)
    }
    @ViewBuilder private func panel(_ s: WidgetSnapshot, _ sampled: Date) -> some View {
        let fresh = entry.date.timeIntervalSince(sampled) < 900
        let name = s.name.isEmpty ? s["deviceModel"] : s.name
        let strength = color(s["rsrp"], low: -105, good: -90)
        let quality = color(s["sinr"], low: 0, good: 13)
        card {
            HStack(spacing: 4) {
                Circle().fill(fresh ? Color.green : Color.gray).frame(width: 6,height: 6)
                Text(s["operator"] == "—" ? name : s["operator"]).fontWeight(.bold)
                Text(s["mode"]).font(.caption2).foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Image(systemName: "cellularbars").foregroundStyle(strength)
            }.font(.caption)
        }
        card {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(s["primaryBand"] == "—" ? s["bandTag"] : s["primaryBand"]).bold()
                    Text(s["bandwidth"].replacingOccurrences(of:"DL ",with:"").components(separatedBy:" / ").first ?? "").foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    if let n = Int(s["carrierCount"]), n > 0 { Text("\(n)CC").foregroundStyle(.blue) }
                }.font(.caption)
                if compact {
                    signalRow("强度", s["rsrp"], -120 ... -60, strength)
                    signalRow("质量", s["sinr"], -10 ... 30, quality)
                } else {
                    HStack {
                        ForEach(["rsrp","sinr","rsrq","rssi"],id: \.self) { key in
                            VStack(spacing: 1) {
                                Text(s[key]).font(.subheadline.bold()).foregroundStyle(key == "rsrp" ? strength : key == "sinr" ? quality : Color.primary)
                                Text(key.uppercased()).font(.caption2).foregroundStyle(.secondary)
                            }.frame(maxWidth:.infinity)
                        }
                    }
                    Text("PCI \(s["pci"])     ARFCN \(s["pccArfcn"])").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        if large {
            card {
                VStack(spacing: 7) {
                    LabeledContent("设备", value: name)
                    LabeledContent("频段", value: s["bandTag"])
                    LabeledContent("接入设备", value: s["onlineNum"])
                    LabeledContent("温度", value: s["modemTemp"])
                    LabeledContent("运行时间", value: s["uptimeText"])
                }.font(.caption)
            }
        }
        HStack(spacing: 3) {
            Image(systemName: "clock")
            Text(sampled, style: .relative)
            Spacer(minLength: 1)
            Text("今日 "+traffic(s,"today"))
            if !compact { Text("本月 "+traffic(s,"month")) }
        }.font(.system(size: 9)).foregroundStyle(.secondary)
    }
    private var contents: some View {
        VStack(alignment:.leading, spacing:compact ? 5 : 7) {
            if let s = entry.snapshot, let date = s.sampledAt { panel(s,date) }
            else {
                Label("Cmodem", systemImage:"antenna.radiowaves.left.and.right").bold()
                Text("打开看板获取设备状态").font(.caption).foregroundStyle(.secondary)
            }
        }.padding(inset).frame(maxWidth:.infinity,maxHeight:.infinity)
            .lineLimit(1).minimumScaleFactor(0.7)
    }
    private var inset: CGFloat {
        if #available(iOS 17.0, *) { return 0 }
        return 9
    }
    @ViewBuilder var body: some View {
        if #available(iOS 17.0, *) { contents.containerBackground(for: .widget) { Color(uiColor:.systemGroupedBackground) } }
        else { contents.background(Color(uiColor:.systemGroupedBackground)) }
    }
}

@main
struct CmodemWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetSnapshot.kind, provider: Provider()) { entry in Overview(entry: entry) }
            .configurationDisplayName("Cmodem 设备状态")
            .description("查看当前设备最近采集的信号、频段和流量。")
            .supportedFamilies([.systemSmall,.systemMedium,.systemLarge])
    }
}
