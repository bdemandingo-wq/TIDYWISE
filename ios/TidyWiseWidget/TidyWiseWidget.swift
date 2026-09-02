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

// MARK: - Widget Views

struct TidyWiseWidgetEntryView: View {
    var entry: BookingEntry

    // TidyWise brand blue: HSL 230 100% 50%
    private let brandBlue = Color(hue: 230.0 / 360.0, saturation: 1.0, brightness: 1.0)
    private let brandBlueDark = Color(hue: 234.0 / 360.0, saturation: 0.6, brightness: 0.65)

    var body: some View {
        if entry.booking.isEmpty {
            emptyStateView
        } else {
            bookingView
        }
    }

    private var bookingView: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(formattedDate)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.white.opacity(0.9))

            Text(entry.booking.customerName ?? "Unknown")
                .font(.subheadline)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .lineLimit(1)

            Text(entry.booking.serviceType ?? "Cleaning")
                .font(.caption)
                .foregroundColor(.white.opacity(0.85))
                .lineLimit(1)

            Spacer()

            Text(entry.booking.address ?? "")
                .font(.caption2)
                .foregroundColor(.white.opacity(0.7))
                .lineLimit(1)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            LinearGradient(
                gradient: Gradient(colors: [brandBlue, brandBlueDark]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .widgetURL(URL(string: "tidywise://booking/\(entry.booking.bookingId ?? "")"))
    }

    private var emptyStateView: some View {
        VStack(spacing: 8) {
            Image(systemName: "calendar.badge.plus")
                .font(.title)
                .foregroundColor(.white.opacity(0.8))

            Text("Tap to schedule")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(
                gradient: Gradient(colors: [brandBlue, brandBlueDark]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .widgetURL(URL(string: "tidywise://new-booking"))
    }

    private var formattedDate: String {
        guard let isoString = entry.booking.scheduledAt,
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
            formatter.dateStyle = .short
            return formatter.string(from: date)
        }
    }
}

// MARK: - Widget Configuration

@main
struct TidyWiseWidget: Widget {
    let kind: String = "TidyWiseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BookingTimelineProvider()) { entry in
            TidyWiseWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Next Booking")
        .description("See your next upcoming booking at a glance.")
        .supportedFamilies([.systemSmall])
    }
}
