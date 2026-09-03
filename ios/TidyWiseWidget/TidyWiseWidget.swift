import WidgetKit
import SwiftUI

// MARK: - Brand

private let brandBlue = Color(hue: 230.0/360, saturation: 0.85, brightness: 0.95)
private let brandBlueDark = Color(hue: 232.0/360, saturation: 0.75, brightness: 0.45)
private var brandGradient: LinearGradient {
    LinearGradient(colors: [brandBlue, brandBlueDark], startPoint: .topLeading, endPoint: .bottomTrailing)
}

private struct BrandedWidget<Content: View>: View {
    let url: URL?; @ViewBuilder var content: Content
    var body: some View {
        content.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .widgetURL(url).modifier(BrandedBG())
    }
}
private struct BrandedBG: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            content.containerBackground(for: .widget) { brandGradient }
        } else { content.background(brandGradient) }
    }
}

// MARK: - Typography Constants
// Time: monospaced 13pt · Name: semibold 14pt · Service: regular 13pt dim · Date header: uppercase 11pt

private let timeFont = Font.system(size: 13, weight: .medium, design: .monospaced)
private let nameFont = Font.system(size: 14, weight: .semibold)
private let serviceFont = Font.system(size: 13)
private let headerFont = Font.system(size: 11, weight: .bold)
private let dimWhite = Color.white.opacity(0.5)
private let faintWhite = Color.white.opacity(0.35)

// MARK: - Date Helpers

private let iso = ISO8601DateFormatter()
private func parseDate(_ s: String?) -> Date? { guard let s else { return nil }; return iso.date(from: s) }

/// Compact time: "10a" or "2:30p" (drops :00)
private func fmtCompact(_ s: String?) -> String {
    guard let d = parseDate(s) else { return "" }
    let cal = Calendar.current
    let min = cal.component(.minute, from: d)
    let f = DateFormatter()
    f.amSymbol = "a"; f.pmSymbol = "p"
    f.dateFormat = min == 0 ? "ha" : "h:mma"
    return f.string(from: d)
}

/// Full date: "Today at 2:00 PM"
private func fmtDate(_ s: String?) -> String {
    guard let d = parseDate(s) else { return "" }
    let f = DateFormatter(); f.timeStyle = .short
    if Calendar.current.isDateInToday(d) { return "Today at \(f.string(from: d))" }
    if Calendar.current.isDateInTomorrow(d) { return "Tomorrow at \(f.string(from: d))" }
    f.dateFormat = "EEE, MMM d 'at' h:mm a"; return f.string(from: d)
}

private func fmtCurrency(_ n: Double) -> String {
    let f = NumberFormatter(); f.numberStyle = .currency; f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: n)) ?? "$0"
}

private func dayLabel(_ s: String) -> String {
    guard let d = parseDate(s) else { return "" }
    if Calendar.current.isDateInToday(d) { return "Today" }
    if Calendar.current.isDateInTomorrow(d) { return "Tomorrow" }
    let f = DateFormatter(); f.dateFormat = "EEE, MMM d"; return f.string(from: d)
}

private func groupByDay(_ bookings: [ScheduleBooking]) -> [(day: String, items: [ScheduleBooking])] {
    var g: [(day: String, items: [ScheduleBooking])] = []
    for b in bookings {
        let l = dayLabel(b.scheduledAt)
        if g.last?.day == l { g[g.count-1].items.append(b) } else { g.append((l, [b])) }
    }
    return g
}

// MARK: - Shared Components

private struct EmptyState: View {
    let message: String; let url: URL?
    var body: some View {
        BrandedWidget(url: url) {
            VStack(spacing: 0) {
                Spacer()
                Image("WidgetLogo").resizable().aspectRatio(contentMode: .fit)
                    .frame(width: 36, height: 36).clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.bottom, 8)
                Text("TidyWise").font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                    .padding(.bottom, 2)
                Text(message).font(.system(size: 12, weight: .medium)).foregroundColor(dimWhite)
                Spacer()
            }.frame(maxWidth: .infinity)
        }
    }
}

/// Single booking row — standardized across all list views
private struct BookingRow: View {
    let time: String; let name: String; let service: String; var price: Double? = nil
    var body: some View {
        HStack(spacing: 6) {
            Text(time).font(timeFont).foregroundColor(dimWhite)
                .frame(width: 38, alignment: .leading)
            Text(name).font(nameFont).foregroundColor(.white).lineLimit(1)
            Text("·").foregroundColor(faintWhite)
            Text(service).font(serviceFont).foregroundColor(dimWhite).lineLimit(1)
            Spacer(minLength: 0)
            if let p = price, p > 0 {
                Text(fmtCurrency(p)).font(.system(size: 12, weight: .medium)).foregroundColor(dimWhite)
            }
        }
    }
}

/// Compact header — logo + label, single line, 12pt
private struct WidgetHeader: View {
    let label: String
    var body: some View {
        HStack(spacing: 5) {
            Image("WidgetLogo").resizable().aspectRatio(contentMode: .fit)
                .frame(width: 14, height: 14).clipShape(RoundedRectangle(cornerRadius: 3))
            Text(label).font(.system(size: 12, weight: .semibold)).foregroundColor(dimWhite)
            Spacer()
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - 1. Next Booking Widget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct NextBookingData: Codable {
    let bookingId: String?; let customerName: String?; let serviceType: String?
    let address: String?; let scheduledAt: String?; let cleanerName: String?; let isEmpty: Bool
}
struct NextBookingEntry: TimelineEntry {
    let date: Date; let booking: NextBookingData; let upcoming: [ScheduleBooking]
}
struct NextBookingProvider: TimelineProvider {
    func placeholder(in _: Context) -> NextBookingEntry {
        NextBookingEntry(date: .now, booking: .init(bookingId: "x", customerName: "Jane Smith",
            serviceType: "Deep Clean", address: "123 Oak St",
            scheduledAt: iso.string(from: .now.addingTimeInterval(3600)),
            cleanerName: "Maria", isEmpty: false), upcoming: [])
    }
    func getSnapshot(in _: Context, completion: @escaping (NextBookingEntry) -> Void) { completion(load()) }
    func getTimeline(in _: Context, completion: @escaping (Timeline<NextBookingEntry>) -> Void) {
        completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(300))))
    }
    private func load() -> NextBookingEntry {
        let b: NextBookingData = decode("widgetNextBooking") ?? .init(bookingId: nil, customerName: nil,
            serviceType: nil, address: nil, scheduledAt: nil, cleanerName: nil, isEmpty: true)
        let s: UpcomingScheduleData? = decode("widgetUpcomingSchedule")
        return NextBookingEntry(date: .now, booking: b, upcoming: s?.bookings ?? [])
    }
}

// Small — 4 lines: time, name, service, address
private struct NBSmall: View {
    let b: NextBookingData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://booking/\(b.bookingId ?? "")")) {
            VStack(alignment: .leading, spacing: 4) {
                Text(fmtDate(b.scheduledAt)).font(.system(size: 12, weight: .medium)).foregroundColor(.white.opacity(0.7))
                Text(b.customerName ?? "").font(.system(size: 17, weight: .bold)).foregroundColor(.white).lineLimit(1)
                Text(b.serviceType ?? "").font(.system(size: 12, weight: .medium)).foregroundColor(.white.opacity(0.6)).lineLimit(1)
                if let a = b.address, !a.isEmpty {
                    Text(a).font(.system(size: 11)).foregroundColor(.white.opacity(0.45)).lineLimit(1)
                }
                Spacer(minLength: 0)
            }.padding(14)
        }
    }
}

// Medium — header + up to 3 compact rows
private struct NBMedium: View {
    let upcoming: [ScheduleBooking]
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(label: "Upcoming")
                ForEach(Array(upcoming.prefix(3).enumerated()), id: \.offset) { _, b in
                    BookingRow(time: fmtCompact(b.scheduledAt), name: b.customerName, service: b.serviceType, price: b.price)
                }
                Spacer(minLength: 0)
            }.padding(14)
        }
    }
}

// Large — header + date-grouped rows, up to 8
private struct NBLarge: View {
    let upcoming: [ScheduleBooking]
    var body: some View {
        let groups = groupByDay(Array(upcoming.prefix(8)))
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(alignment: .leading, spacing: 0) {
                WidgetHeader(label: "Upcoming Bookings").padding(.bottom, 8)
                ForEach(Array(groups.enumerated()), id: \.offset) { gi, group in
                    if gi > 0 {
                        Rectangle().fill(.white.opacity(0.08)).frame(height: 1).padding(.top, 10).padding(.bottom, 8)
                    }
                    Text(group.day.uppercased()).font(headerFont).tracking(0.8)
                        .foregroundColor(faintWhite).padding(.bottom, 6)
                    ForEach(Array(group.items.enumerated()), id: \.offset) { _, b in
                        BookingRow(time: fmtCompact(b.scheduledAt), name: b.customerName, service: b.serviceType, price: b.price)
                            .padding(.bottom, 4)
                    }
                }
                Spacer(minLength: 0)
            }.padding(14)
        }
    }
}

struct NextBookingWidget: Widget {
    let kind = "NextBookingWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextBookingProvider()) { entry in
            NextBookingView(entry: entry)
        }
        .configurationDisplayName("Next Booking")
        .description("Your next upcoming booking at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
private struct NextBookingView: View {
    @Environment(\.widgetFamily) var family; let entry: NextBookingEntry
    var body: some View {
        if entry.booking.isEmpty {
            EmptyState(message: "Tap to schedule", url: URL(string: "tidywise://new-booking"))
        } else {
            let up = entry.upcoming.isEmpty
                ? [ScheduleBooking(bookingId: entry.booking.bookingId ?? "", customerName: entry.booking.customerName ?? "",
                    serviceType: entry.booking.serviceType ?? "Cleaning", scheduledAt: entry.booking.scheduledAt ?? "", price: nil)]
                : entry.upcoming
            switch family {
            case .systemMedium: NBMedium(upcoming: up)
            case .systemLarge:  NBLarge(upcoming: up)
            default:            NBSmall(b: entry.booking)
            }
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - 2. Upcoming Schedule Widget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct ScheduleBooking: Codable {
    let bookingId: String; let customerName: String; let serviceType: String
    let scheduledAt: String; let price: Double?
}
struct UpcomingScheduleData: Codable {
    let totalJobs: Int; let bookings: [ScheduleBooking]; let isEmpty: Bool
}
struct UpcomingScheduleEntry: TimelineEntry { let date: Date; let schedule: UpcomingScheduleData }

struct UpcomingScheduleProvider: TimelineProvider {
    func placeholder(in _: Context) -> UpcomingScheduleEntry {
        UpcomingScheduleEntry(date: .now, schedule: .init(totalJobs: 3, bookings: [
            .init(bookingId: "a", customerName: "Jane Smith", serviceType: "Deep Clean",
                  scheduledAt: iso.string(from: .now.addingTimeInterval(3600)), price: 200),
            .init(bookingId: "b", customerName: "Bob Lee", serviceType: "Standard",
                  scheduledAt: iso.string(from: .now.addingTimeInterval(7200)), price: 150),
        ], isEmpty: false))
    }
    func getSnapshot(in _: Context, completion: @escaping (UpcomingScheduleEntry) -> Void) { completion(load()) }
    func getTimeline(in _: Context, completion: @escaping (Timeline<UpcomingScheduleEntry>) -> Void) {
        completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(300))))
    }
    private func load() -> UpcomingScheduleEntry {
        UpcomingScheduleEntry(date: .now, schedule: decode("widgetUpcomingSchedule") ?? .init(
            totalJobs: 0, bookings: [], isEmpty: true))
    }
}

private struct SchedSmall: View {
    let s: UpcomingScheduleData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(spacing: 4) {
                Spacer()
                Text("\(s.totalJobs)").font(.system(size: 40, weight: .bold, design: .rounded)).foregroundColor(.white)
                Text("upcoming").font(.system(size: 13, weight: .medium)).foregroundColor(.white.opacity(0.6))
                Spacer()
            }.frame(maxWidth: .infinity)
        }
    }
}

private struct SchedMedium: View {
    let s: UpcomingScheduleData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(label: "\(s.totalJobs) upcoming")
                ForEach(Array(s.bookings.prefix(3).enumerated()), id: \.offset) { _, b in
                    BookingRow(time: fmtCompact(b.scheduledAt), name: b.customerName, service: b.serviceType, price: b.price)
                }
                Spacer(minLength: 0)
            }.padding(14)
        }
    }
}

private struct SchedLarge: View {
    let s: UpcomingScheduleData
    var body: some View {
        let groups = groupByDay(Array(s.bookings.prefix(8)))
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(alignment: .leading, spacing: 0) {
                WidgetHeader(label: "\(s.totalJobs) upcoming").padding(.bottom, 8)
                ForEach(Array(groups.enumerated()), id: \.offset) { gi, group in
                    if gi > 0 {
                        Rectangle().fill(.white.opacity(0.08)).frame(height: 1).padding(.top, 10).padding(.bottom, 8)
                    }
                    Text(group.day.uppercased()).font(headerFont).tracking(0.8)
                        .foregroundColor(faintWhite).padding(.bottom, 6)
                    ForEach(Array(group.items.enumerated()), id: \.offset) { _, b in
                        BookingRow(time: fmtCompact(b.scheduledAt), name: b.customerName, service: b.serviceType, price: b.price)
                            .padding(.bottom, 4)
                    }
                }
                Spacer(minLength: 0)
            }.padding(14)
        }
    }
}

struct UpcomingScheduleWidget: Widget {
    let kind = "UpcomingScheduleWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UpcomingScheduleProvider()) { entry in
            UpcomingScheduleView(entry: entry)
        }
        .configurationDisplayName("Upcoming Schedule")
        .description("See your upcoming bookings across all days.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
private struct UpcomingScheduleView: View {
    @Environment(\.widgetFamily) var family; let entry: UpcomingScheduleEntry
    var body: some View {
        if entry.schedule.isEmpty {
            EmptyState(message: "No upcoming jobs", url: URL(string: "tidywise://bookings"))
        } else {
            switch family {
            case .systemMedium: SchedMedium(s: entry.schedule)
            case .systemLarge:  SchedLarge(s: entry.schedule)
            default:            SchedSmall(s: entry.schedule)
            }
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - 3. Dashboard Widget (replaces Daily Stats)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct DailyStatsData: Codable {
    let revenue: Double; let jobsCompleted: Int; let jobsRemaining: Int
    let nextCustomerName: String?; let nextScheduledAt: String?; let nextBookingId: String?
}

struct DashboardEntry: TimelineEntry {
    let date: Date; let stats: DailyStatsData; let upcoming: [ScheduleBooking]
}

struct DashboardProvider: TimelineProvider {
    func placeholder(in _: Context) -> DashboardEntry {
        DashboardEntry(date: .now, stats: .init(revenue: 450, jobsCompleted: 2, jobsRemaining: 1,
            nextCustomerName: "Jane Smith", nextScheduledAt: iso.string(from: .now.addingTimeInterval(3600)),
            nextBookingId: "x"), upcoming: [])
    }
    func getSnapshot(in _: Context, completion: @escaping (DashboardEntry) -> Void) { completion(load()) }
    func getTimeline(in _: Context, completion: @escaping (Timeline<DashboardEntry>) -> Void) {
        completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(300))))
    }
    private func load() -> DashboardEntry {
        let st: DailyStatsData = decode("widgetDailyStats") ?? .init(revenue: 0, jobsCompleted: 0,
            jobsRemaining: 0, nextCustomerName: nil, nextScheduledAt: nil, nextBookingId: nil)
        let sc: UpcomingScheduleData? = decode("widgetUpcomingSchedule")
        return DashboardEntry(date: .now, stats: st, upcoming: sc?.bookings ?? [])
    }
}

// Small — revenue hero
private struct DashSmall: View {
    let s: DailyStatsData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://dashboard")) {
            VStack(spacing: 4) {
                Spacer()
                Text(fmtCurrency(s.revenue)).font(.system(size: 32, weight: .bold, design: .rounded)).foregroundColor(.white)
                Text("today").font(.system(size: 13, weight: .medium)).foregroundColor(dimWhite)
                Text("\(s.jobsCompleted + s.jobsRemaining) jobs").font(.system(size: 12)).foregroundColor(faintWhite)
                Spacer()
            }.frame(maxWidth: .infinity)
        }
    }
}

// Medium — revenue + done/left
private struct DashMedium: View {
    let s: DailyStatsData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://dashboard")) {
            HStack(spacing: 0) {
                VStack(spacing: 4) {
                    Spacer()
                    Text(fmtCurrency(s.revenue)).font(.system(size: 28, weight: .bold, design: .rounded)).foregroundColor(.white)
                    Text("today").font(.system(size: 12, weight: .medium)).foregroundColor(dimWhite)
                    Spacer()
                }.frame(maxWidth: .infinity)
                Rectangle().fill(.white.opacity(0.1)).frame(width: 1).padding(.vertical, 16)
                VStack(spacing: 8) {
                    Spacer()
                    HStack(spacing: 16) {
                        VStack(spacing: 2) {
                            Text("\(s.jobsCompleted)").font(.system(size: 22, weight: .bold, design: .rounded)).foregroundColor(.white)
                            Text("done").font(.system(size: 10, weight: .medium)).foregroundColor(dimWhite)
                        }
                        VStack(spacing: 2) {
                            Text("\(s.jobsRemaining)").font(.system(size: 22, weight: .bold, design: .rounded)).foregroundColor(.white)
                            Text("left").font(.system(size: 10, weight: .medium)).foregroundColor(dimWhite)
                        }
                    }
                    Spacer()
                }.frame(maxWidth: .infinity)
            }.padding(14)
        }
    }
}

// Large — stats top + upcoming schedule bottom (merged dashboard)
private struct DashLarge: View {
    let s: DailyStatsData; let upcoming: [ScheduleBooking]
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://dashboard")) {
            VStack(alignment: .leading, spacing: 0) {
                // Header
                WidgetHeader(label: "Dashboard").padding(.bottom, 10)

                // Revenue + job counts in one row
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(fmtCurrency(s.revenue)).font(.system(size: 28, weight: .bold, design: .rounded)).foregroundColor(.white)
                        Text("revenue today").font(.system(size: 11, weight: .medium)).foregroundColor(dimWhite)
                    }
                    Spacer()
                    HStack(spacing: 14) {
                        VStack(spacing: 1) {
                            Text("\(s.jobsCompleted)").font(.system(size: 20, weight: .bold, design: .rounded)).foregroundColor(.white)
                            Text("done").font(.system(size: 9, weight: .medium)).foregroundColor(dimWhite)
                        }
                        VStack(spacing: 1) {
                            Text("\(s.jobsRemaining)").font(.system(size: 20, weight: .bold, design: .rounded)).foregroundColor(.white)
                            Text("left").font(.system(size: 9, weight: .medium)).foregroundColor(dimWhite)
                        }
                    }
                }.padding(.bottom, 12)

                // Stats / bookings divider
                Rectangle().fill(.white.opacity(0.15)).frame(height: 1).padding(.bottom, 12)

                // Upcoming bookings list
                if upcoming.isEmpty {
                    Text("No upcoming bookings").font(serviceFont).foregroundColor(dimWhite)
                } else {
                    let groups = groupByDay(Array(upcoming.prefix(5)))
                    ForEach(Array(groups.enumerated()), id: \.offset) { gi, group in
                        Text(group.day.uppercased()).font(headerFont).tracking(0.8)
                            .foregroundColor(faintWhite)
                            .padding(.top, gi > 0 ? 8 : 0).padding(.bottom, 4)
                        ForEach(Array(group.items.enumerated()), id: \.offset) { _, b in
                            BookingRow(time: fmtCompact(b.scheduledAt), name: b.customerName, service: b.serviceType, price: b.price)
                                .padding(.bottom, 3)
                        }
                    }
                }
                Spacer(minLength: 0)
            }.padding(14)
        }
    }
}

struct DashboardWidget: Widget {
    let kind = "DashboardWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DashboardProvider()) { entry in
            DashboardView(entry: entry)
        }
        .configurationDisplayName("Dashboard")
        .description("Revenue, job counts, and upcoming bookings.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
private struct DashboardView: View {
    @Environment(\.widgetFamily) var family; let entry: DashboardEntry
    var body: some View {
        switch family {
        case .systemMedium: DashMedium(s: entry.stats)
        case .systemLarge:  DashLarge(s: entry.stats, upcoming: entry.upcoming)
        default:            DashSmall(s: entry.stats)
        }
    }
}

// MARK: - Helpers + Bundle

private func decode<T: Decodable>(_ key: String) -> T? {
    guard let defaults = UserDefaults(suiteName: "group.com.TidyWiseApp.app"),
          let json = defaults.string(forKey: key),
          let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(T.self, from: data)
}

@main
struct TidyWiseWidgets: WidgetBundle {
    var body: some Widget {
        NextBookingWidget()
        UpcomingScheduleWidget()
        DashboardWidget()
    }
}
