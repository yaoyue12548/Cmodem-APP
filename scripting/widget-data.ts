export const widgetKey = "cmodem.widget.overview.v1"

export type WidgetOverview = {
  id: string, name: string, sampledAt: number, model: string, operator: string, mode: string,
  rsrp: string, sinr: string, rsrq: string, bands: string, clients: string, temperature: string
  primaryBand?: string, bandwidth?: string, carrierCount?: number, rssi?: string, pci?: string,
  arfcn?: string, uptime?: string, today?: string, month?: string
}

export function widgetOverview(id: string, name: string, data: Record<string, unknown>, sampledAt: number): WidgetOverview {
  function field(key: string) {
    const raw = data[key]
    if (typeof raw !== "number" && typeof raw !== "string") return ""
    const text = String(raw).trim()
    return /^(?:-+|null|undefined|NaN)$/i.test(text) ? "" : text.slice(0, 80)
  }
  const model = field("deviceModel")
  function traffic(rx: string, tx: string) {
    const parts = [field(rx),field(tx)]
    if (parts.some(p => !p || !Number.isFinite(Number(p)) || Number(p)<0)) return ""
    const mb = Number(parts[0])+Number(parts[1])
    return mb >= 1024 ? (mb/1024).toFixed(1)+" GB" : Math.round(mb)+" MB"
  }
  return {id, name, sampledAt, model: model === "LG6851M" ? "LG6851F" : model,
    primaryBand:field("primaryBand"),bandwidth:field("bandwidth").split(" / ")[0].replace(/^DL\s+/i,""),
    carrierCount:Number(field("carrierCount")) || undefined,rssi:field("rssi"),pci:field("pci"),arfcn:field("pccArfcn"),
    uptime:field("uptimeText"),today:traffic("todayRxToday","todayTxToday"),month:traffic("monthRxToday","monthTxToday"),
    operator: field("operator"), mode: field("mode"), rsrp: field("rsrp"), sinr: field("sinr"),
    rsrq: field("rsrq"), bands: field("bandTag"), clients: field("onlineNum"), temperature: field("modemTemp")}
}
