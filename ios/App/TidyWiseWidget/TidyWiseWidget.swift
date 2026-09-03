import WidgetKit
import SwiftUI

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Brand
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private let brandBlue = Color(hue: 230.0/360, saturation: 0.85, brightness: 0.95)
private let brandBlueDark = Color(hue: 232.0/360, saturation: 0.75, brightness: 0.45)

private var brandGradient: LinearGradient {
    LinearGradient(colors: [brandBlue, brandBlueDark],
                   startPoint: .topLeading, endPoint: .bottomTrailing)
}

private struct BrandedWidget<Content: View>: View {
    let url: URL?
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .widgetURL(url)
            .modifier(BrandedBG())
    }
}

private struct BrandedBG: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            content.containerBackground(for: .widget) { brandGradient }
        } else {
            content.background(brandGradient)
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Date Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private let iso = ISO8601DateFormatter()

private func parseDate(_ s: String?) -> Date? {
    guard let s else { return nil }; return iso.date(from: s)
}

private func fmtDate(_ s: String?) -> String {
    guard let d = parseDate(s) else { return "" }
    let f = DateFormatter(); f.timeStyle = .short
    if Calendar.current.isDateInToday(d)    { return "Today at \(f.string(from: d))" }
    if Calendar.current.isDateInTomorrow(d) { return "Tomorrow at \(f.string(from: d))" }
    f.dateFormat = "EEE, MMM d 'at' h:mm a"; return f.string(from: d)
}

private func fmtTime(_ s: String?) -> String {
    guard let d = parseDate(s) else { return "" }
    let f = DateFormatter(); f.timeStyle = .short; return f.string(from: d)
}

private func fmtCurrency(_ n: Double) -> String {
    let f = NumberFormatter(); f.numberStyle = .currency; f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: n)) ?? "$0"
}

/// "Today", "Tomorrow", "Fri, Sep 5"
private func dayLabel(_ s: String) -> String {
    guard let d = parseDate(s) else { return "" }
    if Calendar.current.isDateInToday(d) { return "Today" }
    if Calendar.current.isDateInTomorrow(d) { return "Tomorrow" }
    let f = DateFormatter(); f.dateFormat = "EEE, MMM d"; return f.string(from: d)
}

/// Group bookings by calendar day, preserving order
private func groupByDay(_ bookings: [ScheduleBooking]) -> [(day: String, items: [ScheduleBooking])] {
    var groups: [(day: String, items: [ScheduleBooking])] = []
    for b in bookings {
        let label = dayLabel(b.scheduledAt)
        if groups.last?.day == label {
            groups[groups.count - 1].items.append(b)
        } else {
            groups.append((day: label, items: [b]))
        }
    }
    return groups
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Shared Empty State
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
                Text(message).font(.system(size: 12, weight: .medium)).foregroundColor(.white.opacity(0.5))
                Spacer()
            }.frame(maxWidth: .infinity)
        }
    }
}

/// Compact single-line booking row for medium/large lists
private struct BookingRow: View {
    let time: String; let name: String; let service: String
    var body: some View {
        HStack(spacing: 6) {
            Text(time)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(.white.opacity(0.55))
                .frame(width: 52, alignment: .leading)
            Text(name)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white).lineLimit(1)
            Text("·").foregroundColor(.white.opacity(0.3))
            Text(service)
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.45)).lineLimit(1)
            Spacer(minLength: 0)
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - 1. Next Booking Widget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct NextBookingData: Codable {
    let bookingId: String?; let customerName: String?; let serviceType: String?
    let address: String?; let scheduledAt: String?; let cleanerName: String?
    let isEmpty: Bool
}

struct NextBookingEntry: TimelineEntry {
    let date: Date; let booking: NextBookingData
    let upcoming: [ScheduleBooking] // for medium/large multi-row
}

struct NextBookingProvider: TimelineProvider {
    func placeholder(in _: Context) -> NextBookingEntry {
        NextBookingEntry(date: .now, booking: .init(
            bookingId: "x", customerName: "Jane Smith", serviceType: "Deep Clean",
            address: "123 Oak St", scheduledAt: iso.string(from: .now.addingTimeInterval(3600)),
            cleanerName: "Maria", isEmpty: false), upcoming: [])
    }
    func getSnapshot(in _: Context, completion: @escaping (NextBookingEntry) -> Void) { completion(load()) }
    func getTimeline(in _: Context, completion: @escaping (Timeline<NextBookingEntry>) -> Void) {
        completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(900))))
    }
    private func load() -> NextBookingEntry {
        let b: NextBookingData = decode("widgetNextBooking") ?? .init(
            bookingId: nil, customerName: nil, serviceType: nil, address: nil,
            scheduledAt: nil, cleanerName: nil, isEmpty: true)
        let sched: UpcomingScheduleData? = decode("widgetUpcomingSchedule")
        return NextBookingEntry(date: .now, booking: b, upcoming: sched?.bookings ?? [])
    }
}

// Small — single booking, 4 lines
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

// Medium — up to 3 bookings, compact rows
private struct NBMedium: View {
    let upcoming: [ScheduleBooking]
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image("WidgetLogo").resizable().aspectRatio(contentMode: .fit)
                        .frame(width: 16, height: 16).clipShape(RoundedRectangle(cornerRadius: 4))
                    Text("Upcoming").font(.system(size: 10, weight: .semibold)).foregroundColor(.white.opacity(0.45))
                    Spacer()
                }.padding(.bottom, 8)

                ForEach(Array(upcoming.prefix(3).enumerated()), id: \.offset) { i, b in
                    BookingRow(time: fmtTime(b.scheduledAt), name: b.customerName, service: b.serviceType)
                    if i < min(upcoming.count, 3) - 1 {
                        Rectangle().fill(.white.opacity(0.08)).frame(height: 1).padding(.vertical, 4)
                    }
                }
                Spacer(minLength: 0)
            }.padding(14)
        }
    }
}

// Large — date-grouped upcoming bookings
private struct NBLarge: View {
    let upcoming: [ScheduleBooking]
    var body: some View {
        let groups = groupByDay(Array(upcoming.prefix(6)))
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image("WidgetLogo").resizable().aspectRatio(contentMode: .fit)
                        .frame(width: 20, height: 20).clipShape(RoundedRectangle(cornerRadius: 5))
                    Text("Upcoming Bookings").font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.45))
                    Spacer()
                }.padding(.bottom, 10)

                ForEach(Array(groups.enumerated()), id: \.offset) { gi, group in
                    Text(group.day.uppercased())
                        .font(.system(size: 9, weight: .bold)).tracking(0.8)
                        .foregroundColor(.white.opacity(0.4))
                        .padding(.top, gi > 0 ? 8 : 0).padding(.bottom, 4)

                    ForEach(Array(group.items.enumerated()), id: \.offset) { _, b in
                        BookingRow(time: fmtTime(b.scheduledAt), name: b.customerName, service: b.serviceType)
                            .padding(.bottom, 3)
                    }
                }
                Spacer(minLength: 0)
            }.padding(16)
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
    @Environment(\.widgetFamily) var family
    let entry: NextBookingEntry
    var body: some View {
        if entry.booking.isEmpty {
            EmptyState(message: "Tap to schedule", url: URL(string: "tidywise://new-booking"))
        } else {
            switch family {
            case .systemMedium: NBMedium(upcoming: entry.upcoming.isEmpty ? bookingAsUpcoming(entry.booking) : entry.upcoming)
            case .systemLarge:  NBLarge(upcoming: entry.upcoming.isEmpty ? bookingAsUpcoming(entry.booking) : entry.upcoming)
            default:            NBSmall(b: entry.booking)
            }
        }
    }

    private func bookingAsUpcoming(_ b: NextBookingData) -> [ScheduleBooking] {
        [ScheduleBooking(bookingId: b.bookingId ?? "", customerName: b.customerName ?? "",
                         serviceType: b.serviceType ?? "Cleaning", scheduledAt: b.scheduledAt ?? "")]
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - 2. Upcoming Schedule Widget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct ScheduleBooking: Codable {
    let bookingId: String; let customerName: String
    let serviceType: String; let scheduledAt: String
}

struct UpcomingScheduleData: Codable {
    let totalJobs: Int; let bookings: [ScheduleBooking]; let isEmpty: Bool
}

struct UpcomingScheduleEntry: TimelineEntry {
    let date: Date; let schedule: UpcomingScheduleData
}

struct UpcomingScheduleProvider: TimelineProvider {
    func placeholder(in _: Context) -> UpcomingScheduleEntry {
        UpcomingScheduleEntry(date: .now, schedule: .init(totalJobs: 3, bookings: [
            .init(bookingId: "a", customerName: "Jane Smith", serviceType: "Deep Clean",
                  scheduledAt: iso.string(from: .now.addingTimeInterval(3600))),
            .init(bookingId: "b", customerName: "Bob Lee", serviceType: "Standard",
                  scheduledAt: iso.string(from: .now.addingTimeInterval(7200))),
        ], isEmpty: false))
    }
    func getSnapshot(in _: Context, completion: @escaping (UpcomingScheduleEntry) -> Void) { completion(load()) }
    func getTimeline(in _: Context, completion: @escaping (Timeline<UpcomingScheduleEntry>) -> Void) {
        completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(900))))
    }
    private func load() -> UpcomingScheduleEntry {
        UpcomingScheduleEntry(date: .now, schedule: decode("widgetUpcomingSchedule") ?? .init(
            totalJobs: 0, bookings: [], isEmpty: true))
    }
}

// Small — job count
private struct SchedSmall: View {
    let s: UpcomingScheduleData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(spacing: 4) {
                Spacer()
                Text("\(s.totalJobs)")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("upcoming")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
                Spacer()
            }.frame(maxWidth: .infinity)
        }
    }
}

// Medium — up to 3 compact rows
private struct SchedMedium: View {
    let s: UpcomingScheduleData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image("WidgetLogo").resizable().aspectRatio(contentMode: .fit)
                        .frame(width: 16, height: 16).clipShape(RoundedRectangle(cornerRadius: 4))
                    Text("\(s.totalJobs) upcoming").font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white.opacity(0.45))
                    Spacer()
                }.padding(.bottom, 8)

                ForEach(Array(s.bookings.prefix(3).enumerated()), id: \.offset) { i, b in
                    BookingRow(time: fmtTime(b.scheduledAt), name: b.customerName, service: b.serviceType)
                    if i < min(s.bookings.count, 3) - 1 {
                        Rectangle().fill(.white.opacity(0.08)).frame(height: 1).padding(.vertical, 4)
                    }
                }
                Spacer(minLength: 0)
            }.padding(14)
        }
    }
}

// Large — date-grouped, up to 6
private struct SchedLarge: View {
    let s: UpcomingScheduleData
    var body: some View {
        let groups = groupByDay(Array(s.bookings.prefix(6)))
        BrandedWidget(url: URL(string: "tidywise://bookings")) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image("WidgetLogo").resizable().aspectRatio(contentMode: .fit)
                        .frame(width: 20, height: 20).clipShape(RoundedRectangle(cornerRadius: 5))
                    Text("\(s.totalJobs) upcoming").font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.45))
                    Spacer()
                }.padding(.bottom, 10)

                ForEach(Array(groups.enumerated()), id: \.offset) { gi, group in
                    Text(group.day.uppercased())
                        .font(.system(size: 9, weight: .bold)).tracking(0.8)
                        .foregroundColor(.white.opacity(0.4))
                        .padding(.top, gi > 0 ? 8 : 0).padding(.bottom, 4)

                    ForEach(Array(group.items.enumerated()), id: \.offset) { _, b in
                        BookingRow(time: fmtTime(b.scheduledAt), name: b.customerName, service: b.serviceType)
                            .padding(.bottom, 3)
                    }
                }
                Spacer(minLength: 0)
            }.padding(16)
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
    @Environment(\.widgetFamily) var family
    let entry: UpcomingScheduleEntry
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - 3. Daily Stats Widget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct DailyStatsData: Codable {
    let revenue: Double; let jobsCompleted: Int; let jobsRemaining: Int
    let nextCustomerName: String?; let nextScheduledAt: String?; let nextBookingId: String?
}

struct DailyStatsEntry: TimelineEntry { let date: Date; let stats: DailyStatsData }

struct DailyStatsProvider: TimelineProvider {
    func placeholder(in _: Context) -> DailyStatsEntry {
        DailyStatsEntry(date: .now, stats: .init(revenue: 450, jobsCompleted: 2,
            jobsRemaining: 1, nextCustomerName: "Jane Smith",
            nextScheduledAt: iso.string(from: .now.addingTimeInterval(3600)), nextBookingId: "x"))
    }
    func getSnapshot(in _: Context, completion: @escaping (DailyStatsEntry) -> Void) { completion(load()) }
    func getTimeline(in _: Context, completion: @escaping (Timeline<DailyStatsEntry>) -> Void) {
        completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(900))))
    }
    private func load() -> DailyStatsEntry {
        DailyStatsEntry(date: .now, stats: decode("widgetDailyStats") ?? .init(
            revenue: 0, jobsCompleted: 0, jobsRemaining: 0,
            nextCustomerName: nil, nextScheduledAt: nil, nextBookingId: nil))
    }
}

private struct StatsSmall: View {
    let s: DailyStatsData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://dashboard")) {
            VStack(spacing: 4) {
                Spacer()
                Text(fmtCurrency(s.revenue)).font(.system(size: 32, weight: .bold, design: .rounded)).foregroundColor(.white)
                Text("today").font(.system(size: 13, weight: .medium)).foregroundColor(.white.opacity(0.5))
                Text("\(s.jobsCompleted + s.jobsRemaining) jobs").font(.system(size: 12)).foregroundColor(.white.opacity(0.4))
                Spacer()
            }.frame(maxWidth: .infinity)
        }
    }
}

private struct StatsMedium: View {
    let s: DailyStatsData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://dashboard")) {
            HStack(spacing: 0) {
                VStack(spacing: 4) {
                    Spacer()
                    Text(fmtCurrency(s.revenue)).font(.system(size: 28, weight: .bold, design: .rounded)).foregroundColor(.white)
                    Text("today").font(.system(size: 12, weight: .medium)).foregroundColor(.white.opacity(0.5))
                    Spacer()
                }.frame(maxWidth: .infinity)
                Rectangle().fill(.white.opacity(0.1)).frame(width: 1).padding(.vertical, 16)
                VStack(spacing: 10) {
                    Spacer()
                    HStack(spacing: 12) {
                        VStack(spacing: 2) {
                            Text("\(s.jobsCompleted)").font(.system(size: 22, weight: .bold, design: .rounded)).foregroundColor(.white)
                            Text("done").font(.system(size: 10, weight: .medium)).foregroundColor(.white.opacity(0.5))
                        }
                        VStack(spacing: 2) {
                            Text("\(s.jobsRemaining)").font(.system(size: 22, weight: .bold, design: .rounded)).foregroundColor(.white)
                            Text("left").font(.system(size: 10, weight: .medium)).foregroundColor(.white.opacity(0.5))
                        }
                    }
                    Spacer()
                }.frame(maxWidth: .infinity)
            }.padding(16)
        }
    }
}

private struct StatsLarge: View {
    let s: DailyStatsData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://dashboard")) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image("WidgetLogo").resizable().aspectRatio(contentMode: .fit)
                        .frame(width: 22, height: 22).clipShape(RoundedRectangle(cornerRadius: 5))
                    Text("Today's Stats").font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.5))
                    Spacer()
                }.padding(.bottom, 16)
                Text(fmtCurrency(s.revenue)).font(.system(size: 36, weight: .bold, design: .rounded)).foregroundColor(.white).padding(.bottom, 2)
                Text("revenue today").font(.system(size: 13, weight: .medium)).foregroundColor(.white.opacity(0.5)).padding(.bottom, 14)
                Rectangle().fill(.white.opacity(0.1)).frame(height: 1).padding(.bottom, 14)
                HStack(spacing: 24) {
                    VStack(spacing: 2) {
                        Text("\(s.jobsCompleted)").font(.system(size: 24, weight: .bold, design: .rounded)).foregroundColor(.white)
                        Text("completed").font(.system(size: 10, weight: .medium)).foregroundColor(.white.opacity(0.5))
                    }
                    VStack(spacing: 2) {
                        Text("\(s.jobsRemaining)").font(.system(size: 24, weight: .bold, design: .rounded)).foregroundColor(.white)
                        Text("remaining").font(.system(size: 10, weight: .medium)).foregroundColor(.white.opacity(0.5))
                    }
                }.padding(.bottom, 14)
                if let name = s.nextCustomerName {
                    Rectangle().fill(.white.opacity(0.1)).frame(height: 1).padding(.bottom, 12)
                    Text("UP NEXT").font(.system(size: 9, weight: .bold)).tracking(1).foregroundColor(.white.opacity(0.4)).padding(.bottom, 4)
                    HStack(spacing: 6) {
                        Text(fmtTime(s.nextScheduledAt)).font(.system(size: 12, weight: .semibold, design: .monospaced)).foregroundColor(.white.opacity(0.6))
                        Text(name).font(.system(size: 14, weight: .bold)).foregroundColor(.white).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }.padding(20)
        }
    }
}

struct DailyStatsWidget: Widget {
    let kind = "DailyStatsWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DailyStatsProvider()) { entry in
            DailyStatsView(entry: entry)
        }
        .configurationDisplayName("Daily Stats")
        .description("Revenue and job counts for today.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

private struct DailyStatsView: View {
    @Environment(\.widgetFamily) var family
    let entry: DailyStatsEntry
    var body: some View {
        switch family {
        case .systemMedium: StatsMedium(s: entry.stats)
        case .systemLarge:  StatsLarge(s: entry.stats)
        default:            StatsSmall(s: entry.stats)
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Helpers + Bundle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
        DailyStatsWidget()
    }
}
