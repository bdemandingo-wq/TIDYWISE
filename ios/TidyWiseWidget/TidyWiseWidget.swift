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

// MARK: - Brand Colors

private let brandBlue = Color(hue: 230.0 / 360.0, saturation: 1.0, brightness: 1.0)
private let brandBlueDark = Color(hue: 234.0 / 360.0, saturation: 0.6, brightness: 0.65)

private var brandGradient: LinearGradient {
    LinearGradient(
        gradient: Gradient(colors: [brandBlue, brandBlueDark]),
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

// MARK: - Small Widget View

struct SmallBookingView: View {
    var entry: BookingEntry

    var body: some View {
        if entry.booking.isEmpty {
            SmallEmptyStateView()
        } else {
            SmallFilledView(entry: entry)
        }
    }
}

struct SmallFilledView: View {
    var entry: BookingEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(formatDate(entry.booking.scheduledAt))
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
        .background(brandGradient)
        .widgetURL(URL(string: "tidywise://booking/\(entry.booking.bookingId ?? "")"))
    }
}

struct SmallEmptyStateView: View {
    var body: some View {
        VStack(spacing: 6) {
            Spacer()

            Text("TidyWise")
                .font(.headline)
                .fontWeight(.bold)
                .foregroundColor(.white)

            Image(systemName: "sparkles")
                .font(.title2)
                .foregroundColor(.white.opacity(0.9))

            Text("Tap to schedule")
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(.white.opacity(0.8))

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(brandGradient)
        .widgetURL(URL(string: "tidywise://new-booking"))
    }
}

// MARK: - Medium Widget View

struct MediumBookingView: View {
    var entry: BookingEntry

    var body: some View {
        if entry.booking.isEmpty {
            MediumEmptyStateView()
        } else {
            MediumFilledView(entry: entry)
        }
    }
}

struct MediumFilledView: View {
    var entry: BookingEntry

    var body: some View {
        HStack(spacing: 0) {
            // Left: time + customer
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: "clock.fill")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.8))
                    Text(formatDate(entry.booking.scheduledAt))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.white.opacity(0.9))
                }

                Text(entry.booking.customerName ?? "Unknown")
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                    .lineLimit(1)

                Spacer()

                Text("Next Booking")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(.white.opacity(0.5))
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)

            // Right: service + address
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: "house.fill")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.8))
                    Text(entry.booking.serviceType ?? "Cleaning")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.white.opacity(0.9))
                        .lineLimit(1)
                }

                HStack(spacing: 4) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.8))
                    Text(entry.booking.address ?? "")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                        .lineLimit(2)
                }

                Spacer()

                Text("TidyWise")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundColor(.white.opacity(0.5))
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.08))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(brandGradient)
        .widgetURL(URL(string: "tidywise://booking/\(entry.booking.bookingId ?? "")"))
    }
}

struct MediumEmptyStateView: View {
    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("TidyWise")
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)

                Text("No upcoming bookings")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.7))
            }

            Spacer()

            VStack(spacing: 4) {
                Image(systemName: "sparkles")
                    .font(.title2)
                    .foregroundColor(.white.opacity(0.9))

                Text("Tap to schedule")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.white.opacity(0.8))
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
        formatter.dateStyle = .short
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
