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

// Wrap any view with the gradient — handles containerBackground on iOS 17+
private struct BrandedWidget<Content: View>: View {
    let url: URL?
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(0)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .widgetURL(url)
            .modifier(BrandedBackground())
    }
}

private struct BrandedBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            content
                .containerBackground(for: .widget) { brandGradient }
        } else {
            content.background(brandGradient)
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Date Formatting
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private func formatDate(_ iso: String?) -> String {
    guard let iso, let date = ISO8601DateFormatter().date(from: iso) else { return "" }
    let f = DateFormatter(); f.timeStyle = .short
    if Calendar.current.isDateInToday(date)    { return "Today at \(f.string(from: date))" }
    if Calendar.current.isDateInTomorrow(date) { return "Tomorrow at \(f.string(from: date))" }
    f.dateFormat = "EEE, MMM d 'at' h:mm a"; return f.string(from: date)
}

private func formatTime(_ iso: String?) -> String {
    guard let iso, let date = ISO8601DateFormatter().date(from: iso) else { return "" }
    let f = DateFormatter(); f.timeStyle = .short; return f.string(from: date)
}

private func formatCurrency(_ amount: Double) -> String {
    let f = NumberFormatter(); f.numberStyle = .currency; f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: amount)) ?? "$0"
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Shared Empty State
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct EmptyState: View {
    let message: String
    let url: URL?

    var body: some View {
        BrandedWidget(url: url) {
            VStack(spacing: 0) {
                Spacer()
                Image("WidgetLogo")
                    .resizable().aspectRatio(contentMode: .fit)
                    .frame(width: 36, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.bottom, 8)
                Text("TidyWise")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.bottom, 2)
                Text(message)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                Spacer()
            }
            .frame(maxWidth: .infinity)
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - 1. Next Booking Widget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct NextBookingData: Codable {
    let bookingId: String?
    let customerName: String?
    let serviceType: String?
    let address: String?
    let scheduledAt: String?
    let cleanerName: String?
    let isEmpty: Bool
}

struct NextBookingEntry: TimelineEntry {
    let date: Date
    let booking: NextBookingData
}

struct NextBookingProvider: TimelineProvider {
    func placeholder(in _: Context) -> NextBookingEntry {
        NextBookingEntry(date: .now, booking: .init(
            bookingId: "x", customerName: "Jane Smith", serviceType: "Deep Clean",
            address: "123 Oak St", scheduledAt: ISO8601DateFormatter().string(from: .now.addingTimeInterval(3600)),
            cleanerName: "Maria", isEmpty: false))
    }
    func getSnapshot(in _: Context, completion: @escaping (NextBookingEntry) -> Void) { completion(load()) }
    func getTimeline(in _: Context, completion: @escaping (Timeline<NextBookingEntry>) -> Void) {
        completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(900))))
    }
    private func load() -> NextBookingEntry {
        NextBookingEntry(date: .now, booking: decode("widgetNextBooking") ?? .init(
            bookingId: nil, customerName: nil, serviceType: nil, address: nil,
            scheduledAt: nil, cleanerName: nil, isEmpty: true))
    }
}

// Views

private struct NextBookingSmall: View {
    let b: NextBookingData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://booking/\(b.bookingId ?? "")")) {
            VStack(alignment: .leading, spacing: 4) {
                Text(formatDate(b.scheduledAt))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                Text(b.customerName ?? "Unknown")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white).lineLimit(1)
                Text(b.serviceType ?? "Cleaning")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.6)).lineLimit(1)
                if let a = b.address, !a.isEmpty {
                    Text(a).font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.45)).lineLimit(1)
                }
                Spacer(minLength: 0)
            }.padding(14)
        }
    }
}

private struct NextBookingMedium: View {
    let b: NextBookingData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://booking/\(b.bookingId ?? "")")) {
            VStack(alignment: .leading, spacing: 5) {
                Text(formatDate(b.scheduledAt))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                Text(b.customerName ?? "Unknown")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white).lineLimit(1)
                Text(b.serviceType ?? "Cleaning")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.6)).lineLimit(1)
                if let a = b.address, !a.isEmpty {
                    Text(a).font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.45)).lineLimit(1)
                }
                if let c = b.cleanerName, !c.isEmpty {
                    Spacer(minLength: 0)
                    HStack(spacing: 4) {
                        Image(systemName: "person.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.4))
                        Text(c).font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.5))
                    }
                } else {
                    Spacer(minLength: 0)
                }
            }.padding(16)
        }
    }
}

private struct NextBookingLarge: View {
    let b: NextBookingData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://booking/\(b.bookingId ?? "")")) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image("WidgetLogo").resizable().aspectRatio(contentMode: .fit)
                        .frame(width: 22, height: 22).clipShape(RoundedRectangle(cornerRadius: 5))
                    Text("Next Booking").font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white.opacity(0.5))
                    Spacer()
                }.padding(.bottom, 16)

                Text(formatDate(b.scheduledAt))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white.opacity(0.7)).padding(.bottom, 4)
                Text(b.customerName ?? "Unknown")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.white).lineLimit(2).padding(.bottom, 8)

                Rectangle().fill(.white.opacity(0.1)).frame(height: 1).padding(.bottom, 12)

                HStack(spacing: 6) {
                    Image(systemName: "sparkles").font(.system(size: 11)).foregroundColor(.white.opacity(0.4))
                    Text(b.serviceType ?? "Cleaning").font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.65))
                }.padding(.bottom, 6)
                if let a = b.address, !a.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "mappin.circle.fill").font(.system(size: 11)).foregroundColor(.white.opacity(0.4))
                        Text(a).font(.system(size: 13)).foregroundColor(.white.opacity(0.5)).lineLimit(2)
                    }.padding(.bottom, 6)
                }
                if let c = b.cleanerName, !c.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "person.fill").font(.system(size: 11)).foregroundColor(.white.opacity(0.4))
                        Text(c).font(.system(size: 13, weight: .medium)).foregroundColor(.white.opacity(0.5))
                    }
                }
                Spacer(minLength: 0)
            }.padding(20)
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
            case .systemMedium: NextBookingMedium(b: entry.booking)
            case .systemLarge:  NextBookingLarge(b: entry.booking)
            default:            NextBookingSmall(b: entry.booking)
            }
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - 2. Today's Schedule Widget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct ScheduleBooking: Codable {
    let bookingId: String
    let customerName: String
    let serviceType: String
    let scheduledAt: String
}

struct TodayScheduleData: Codable {
    let totalJobs: Int
    let bookings: [ScheduleBooking]
    let isEmpty: Bool
}

struct TodayScheduleEntry: TimelineEntry {
    let date: Date; let schedule: TodayScheduleData
}

struct TodayScheduleProvider: TimelineProvider {
    func placeholder(in _: Context) -> TodayScheduleEntry {
        TodayScheduleEntry(date: .now, schedule: .init(totalJobs: 3, bookings: [
            .init(bookingId: "a", customerName: "Jane Smith", serviceType: "Deep Clean",
                  scheduledAt: ISO8601DateFormatter().string(from: .now.addingTimeInterval(3600))),
            .init(bookingId: "b", customerName: "Bob Lee", serviceType: "Standard",
                  scheduledAt: ISO8601DateFormatter().string(from: .now.addingTimeInterval(7200))),
        ], isEmpty: false))
    }
    func getSnapshot(in _: Context, completion: @escaping (TodayScheduleEntry) -> Void) { completion(load()) }
    func getTimeline(in _: Context, completion: @escaping (Timeline<TodayScheduleEntry>) -> Void) {
        completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(900))))
    }
    private func load() -> TodayScheduleEntry {
        TodayScheduleEntry(date: .now, schedule: decode("widgetTodaySchedule") ?? .init(
            totalJobs: 0, bookings: [], isEmpty: true))
    }
}

// Views

private struct ScheduleSmall: View {
    let s: TodayScheduleData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://today")) {
            VStack(spacing: 4) {
                Spacer()
                Text("\(s.totalJobs)")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text(s.totalJobs == 1 ? "job today" : "jobs today")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
                Spacer()
            }.frame(maxWidth: .infinity)
        }
    }
}

private struct ScheduleMedium: View {
    let s: TodayScheduleData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://today")) {
            VStack(alignment: .leading, spacing: 0) {
                Text("\(s.totalJobs) \(s.totalJobs == 1 ? "job" : "jobs") today")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.5))
                    .padding(.bottom, 8)
                ForEach(Array(s.bookings.prefix(2).enumerated()), id: \.offset) { _, b in
                    HStack(spacing: 8) {
                        Text(formatTime(b.scheduledAt))
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white.opacity(0.6))
                            .frame(width: 56, alignment: .leading)
                        Text(b.customerName)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white).lineLimit(1)
                    }.padding(.bottom, 6)
                }
                Spacer(minLength: 0)
            }.padding(16)
        }
    }
}

private struct ScheduleLarge: View {
    let s: TodayScheduleData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://today")) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image("WidgetLogo").resizable().aspectRatio(contentMode: .fit)
                        .frame(width: 22, height: 22).clipShape(RoundedRectangle(cornerRadius: 5))
                    Text("\(s.totalJobs) \(s.totalJobs == 1 ? "job" : "jobs") today")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white.opacity(0.5))
                    Spacer()
                }.padding(.bottom, 12)

                ForEach(Array(s.bookings.prefix(6).enumerated()), id: \.offset) { i, b in
                    HStack(spacing: 10) {
                        Text(formatTime(b.scheduledAt))
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white.opacity(0.6))
                            .frame(width: 56, alignment: .leading)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(b.customerName)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white).lineLimit(1)
                            Text(b.serviceType)
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.45)).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    if i < min(s.bookings.count, 6) - 1 {
                        Rectangle().fill(.white.opacity(0.08)).frame(height: 1).padding(.vertical, 6)
                    }
                }
                Spacer(minLength: 0)
            }.padding(20)
        }
    }
}

struct TodayScheduleWidget: Widget {
    let kind = "TodayScheduleWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayScheduleProvider()) { entry in
            TodayScheduleView(entry: entry)
        }
        .configurationDisplayName("Today's Schedule")
        .description("See all your jobs for today.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

private struct TodayScheduleView: View {
    @Environment(\.widgetFamily) var family
    let entry: TodayScheduleEntry
    var body: some View {
        if entry.schedule.isEmpty {
            EmptyState(message: "No jobs today", url: URL(string: "tidywise://today"))
        } else {
            switch family {
            case .systemMedium: ScheduleMedium(s: entry.schedule)
            case .systemLarge:  ScheduleLarge(s: entry.schedule)
            default:            ScheduleSmall(s: entry.schedule)
            }
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - 3. Daily Stats Widget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

struct DailyStatsData: Codable {
    let revenue: Double
    let jobsCompleted: Int
    let jobsRemaining: Int
    let nextCustomerName: String?
    let nextScheduledAt: String?
    let nextBookingId: String?
}

struct DailyStatsEntry: TimelineEntry {
    let date: Date; let stats: DailyStatsData
}

struct DailyStatsProvider: TimelineProvider {
    func placeholder(in _: Context) -> DailyStatsEntry {
        DailyStatsEntry(date: .now, stats: .init(revenue: 450, jobsCompleted: 2,
            jobsRemaining: 1, nextCustomerName: "Jane Smith",
            nextScheduledAt: ISO8601DateFormatter().string(from: .now.addingTimeInterval(3600)),
            nextBookingId: "x"))
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

// Views

private struct StatsSmall: View {
    let s: DailyStatsData
    var body: some View {
        BrandedWidget(url: URL(string: "tidywise://dashboard")) {
            VStack(spacing: 4) {
                Spacer()
                Text(formatCurrency(s.revenue))
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("today")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                Text("\(s.jobsCompleted + s.jobsRemaining) jobs")
                    .font(.system(size: 12)).foregroundColor(.white.opacity(0.4))
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
                // Revenue
                VStack(spacing: 4) {
                    Spacer()
                    Text(formatCurrency(s.revenue))
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    Text("today")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                    Spacer()
                }.frame(maxWidth: .infinity)

                Rectangle().fill(.white.opacity(0.1)).frame(width: 1).padding(.vertical, 16)

                // Jobs
                VStack(spacing: 10) {
                    Spacer()
                    HStack(spacing: 12) {
                        VStack(spacing: 2) {
                            Text("\(s.jobsCompleted)")
                                .font(.system(size: 22, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                            Text("done")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.white.opacity(0.5))
                        }
                        VStack(spacing: 2) {
                            Text("\(s.jobsRemaining)")
                                .font(.system(size: 22, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                            Text("left")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.white.opacity(0.5))
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
                    Text("Today's Stats").font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white.opacity(0.5))
                    Spacer()
                }.padding(.bottom, 16)

                // Revenue hero
                Text(formatCurrency(s.revenue))
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundColor(.white).padding(.bottom, 2)
                Text("revenue today")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.5)).padding(.bottom, 14)

                Rectangle().fill(.white.opacity(0.1)).frame(height: 1).padding(.bottom, 14)

                // Stats row
                HStack(spacing: 24) {
                    VStack(spacing: 2) {
                        Text("\(s.jobsCompleted)").font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("completed").font(.system(size: 10, weight: .medium))
                            .foregroundColor(.white.opacity(0.5))
                    }
                    VStack(spacing: 2) {
                        Text("\(s.jobsRemaining)").font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("remaining").font(.system(size: 10, weight: .medium))
                            .foregroundColor(.white.opacity(0.5))
                    }
                }.padding(.bottom, 14)

                // Next booking mini card
                if let name = s.nextCustomerName {
                    Rectangle().fill(.white.opacity(0.1)).frame(height: 1).padding(.bottom, 12)
                    Text("UP NEXT").font(.system(size: 9, weight: .bold)).tracking(1)
                        .foregroundColor(.white.opacity(0.4)).padding(.bottom, 4)
                    HStack(spacing: 6) {
                        Text(formatTime(s.nextScheduledAt))
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundColor(.white.opacity(0.6))
                        Text(name).font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white).lineLimit(1)
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
// MARK: - Shared Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private func decode<T: Decodable>(_ key: String) -> T? {
    guard let defaults = UserDefaults(suiteName: "group.com.TidyWiseApp.app"),
          let json = defaults.string(forKey: key),
          let data = json.data(using: .utf8) else {
        print("[TidyWiseWidget] no data for key '\(key)'")
        return nil
    }
    do {
        let result = try JSONDecoder().decode(T.self, from: data)
        print("[TidyWiseWidget] decoded '\(key)' OK")
        return result
    } catch {
        print("[TidyWiseWidget] decode error for '\(key)': \(error)")
        return nil
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARK: - Widget Bundle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@main
struct TidyWiseWidgets: WidgetBundle {
    var body: some Widget {
        NextBookingWidget()
        TodayScheduleWidget()
        DailyStatsWidget()
    }
}
