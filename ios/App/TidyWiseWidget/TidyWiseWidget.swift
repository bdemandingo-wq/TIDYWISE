import WidgetKit
import SwiftUI

// MARK: - Data Model

struct BookingData: Codable {
    let bookingId: String?
    let customerName: String?
    let serviceType: String?
    let address: String?
    let scheduledAt: String?
    let isEmpty: Bool
}

struct BookingEntry: TimelineEntry {
    let date: Date
    let booking: BookingData
}

// MARK: - Timeline Provider

struct BookingTimelineProvider: TimelineProvider {
    private let appGroupID = "group.com.TidyWiseApp.app"
    private let storageKey = "widgetNextBooking"

    func placeholder(in context: Context) -> BookingEntry {
        BookingEntry(
            date: Date(),
            booking: BookingData(
                bookingId: "preview",
                customerName: "Jane Smith",
                serviceType: "Deep Clean",
                address: "123 Oak St",
                scheduledAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600)),
                isEmpty: false
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (BookingEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BookingEntry>) -> Void) {
        let entry = loadEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadEntry() -> BookingEntry {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let jsonString = defaults.string(forKey: storageKey),
              let jsonData = jsonString.data(using: .utf8),
              let booking = try? JSONDecoder().decode(BookingData.self, from: jsonData) else {
            return BookingEntry(date: Date(), booking: BookingData(
                bookingId: nil, customerName: nil, serviceType: nil,
                address: nil, scheduledAt: nil, isEmpty: true
            ))
        }
        return BookingEntry(date: Date(), booking: booking)
    }
}

// MARK: - Brand

private let brandBlue = Color(hue: 230.0 / 360.0, saturation: 0.85, brightness: 0.95)
private let brandBlueDark = Color(hue: 232.0 / 360.0, saturation: 0.75, brightness: 0.45)
private let brandAccent = Color(hue: 145.0 / 360.0, saturation: 0.65, brightness: 0.70)

private var brandGradient: LinearGradient {
    LinearGradient(
        colors: [brandBlue, brandBlueDark],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

// MARK: - Small Widget

struct SmallBookingView: View {
    var entry: BookingEntry

    var body: some View {
        if entry.booking.isEmpty {
            SmallEmptyView()
        } else {
            SmallFilledView(entry: entry)
        }
    }
}

struct SmallFilledView: View {
    var entry: BookingEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header row: logo + label
            HStack(spacing: 5) {
                Image("WidgetLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 20, height: 20)
                    .clipShape(RoundedRectangle(cornerRadius: 5))

                Text("NEXT UP")
                    .font(.system(size: 9, weight: .bold))
                    .tracking(1.2)
                    .foregroundColor(.white.opacity(0.6))

                Spacer()
            }
            .padding(.bottom, 8)

            // Time
            Text(formatDate(entry.booking.scheduledAt))
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(brandAccent)
                .lineLimit(1)
                .padding(.bottom, 2)

            // Customer
            Text(entry.booking.customerName ?? "Unknown")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)

            Spacer(minLength: 4)

            // Service + address
            Text(entry.booking.serviceType ?? "Cleaning")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white.opacity(0.7))
                .lineLimit(1)

            if let addr = entry.booking.address, !addr.isEmpty {
                Text(addr)
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(0.45))
                    .lineLimit(1)
                    .padding(.top, 1)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(brandGradient)
        .widgetURL(URL(string: "tidywise://booking/\(entry.booking.bookingId ?? "")"))
    }
}

struct SmallEmptyView: View {
    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            Image("WidgetLogo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 40, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.bottom, 10)

            Text("TidyWise")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
                .padding(.bottom, 2)

            Text("Tap to schedule")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.55))

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(brandGradient)
        .widgetURL(URL(string: "tidywise://new-booking"))
    }
}

// MARK: - Medium Widget

struct MediumBookingView: View {
    var entry: BookingEntry

    var body: some View {
        if entry.booking.isEmpty {
            MediumEmptyView()
        } else {
            MediumFilledView(entry: entry)
        }
    }
}

struct MediumFilledView: View {
    var entry: BookingEntry

    var body: some View {
        HStack(spacing: 0) {
            // Left column
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 5) {
                    Image("WidgetLogo")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 18, height: 18)
                        .clipShape(RoundedRectangle(cornerRadius: 4))

                    Text("NEXT UP")
                        .font(.system(size: 9, weight: .bold))
                        .tracking(1.2)
                        .foregroundColor(.white.opacity(0.5))

                    Spacer()
                }
                .padding(.bottom, 8)

                Text(formatDate(entry.booking.scheduledAt))
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundColor(brandAccent)
                    .lineLimit(1)
                    .padding(.bottom, 2)

                Text(entry.booking.customerName ?? "Unknown")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Spacer()
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .topLeading)

            // Divider
            Rectangle()
                .fill(Color.white.opacity(0.1))
                .frame(width: 1)
                .padding(.vertical, 14)

            // Right column
            VStack(alignment: .leading, spacing: 8) {
                Spacer()

                Label {
                    Text(entry.booking.serviceType ?? "Cleaning")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                } icon: {
                    Image(systemName: "bubbles.and.sparkles.fill")
                        .font(.system(size: 10))
                        .foregroundColor(brandAccent)
                }

                if let addr = entry.booking.address, !addr.isEmpty {
                    Label {
                        Text(addr)
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.6))
                            .lineLimit(2)
                    } icon: {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.4))
                    }
                }

                Spacer()
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(brandGradient)
        .widgetURL(URL(string: "tidywise://booking/\(entry.booking.bookingId ?? "")"))
    }
}

struct MediumEmptyView: View {
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Image("WidgetLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 32, height: 32)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.bottom, 4)

                Text("TidyWise")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)

                Text("No upcoming bookings")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.5))
            }

            Spacer()

            VStack {
                Spacer()
                Text("Tap to schedule")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(brandAccent)
                Spacer()
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(brandGradient)
        .widgetURL(URL(string: "tidywise://new-booking"))
    }
}

// MARK: - Date Formatting

private func formatDate(_ isoString: String?) -> String {
    guard let isoString = isoString,
          let date = ISO8601DateFormatter().date(from: isoString) else {
        return ""
    }

    let calendar = Calendar.current
    let formatter = DateFormatter()
    formatter.timeStyle = .short

    if calendar.isDateInToday(date) {
        return "Today, \(formatter.string(from: date))"
    } else if calendar.isDateInTomorrow(date) {
        return "Tomorrow, \(formatter.string(from: date))"
    } else {
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - Widget Configuration

@main
struct TidyWiseWidget: Widget {
    let kind: String = "TidyWiseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BookingTimelineProvider()) { entry in
            WidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Next Booking")
        .description("See your next upcoming booking at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct WidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: BookingEntry

    var body: some View {
        switch family {
        case .systemMedium:
            MediumBookingView(entry: entry)
        default:
            SmallBookingView(entry: entry)
        }
    }
}
