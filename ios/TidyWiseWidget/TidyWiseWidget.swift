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

private var brandGradient: LinearGradient {
    LinearGradient(
        colors: [brandBlue, brandBlueDark],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
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
        return "Today at \(formatter.string(from: date))"
    } else if calendar.isDateInTomorrow(date) {
        return "Tomorrow at \(formatter.string(from: date))"
    } else {
        formatter.dateFormat = "EEE, MMM d 'at' h:mm a"
        return formatter.string(from: date)
    }
}

// MARK: - Shared Components

/// The four booking info lines used across all sizes. Sizes control the fonts.
struct BookingInfoStack: View {
    var entry: BookingEntry
    var timeFont: Font
    var nameFont: Font
    var serviceFont: Font
    var addressFont: Font

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(formatDate(entry.booking.scheduledAt))
                .font(timeFont)
                .foregroundColor(.white.opacity(0.75))
                .lineLimit(1)

            Text(entry.booking.customerName ?? "Unknown")
                .font(nameFont)
                .foregroundColor(.white)
                .lineLimit(1)

            Text(entry.booking.serviceType ?? "Cleaning")
                .font(serviceFont)
                .foregroundColor(.white.opacity(0.65))
                .lineLimit(1)

            if let addr = entry.booking.address, !addr.isEmpty {
                Text(addr)
                    .font(addressFont)
                    .foregroundColor(.white.opacity(0.5))
                    .lineLimit(1)
            }
        }
    }
}

struct EmptyStateView: View {
    var logoSize: CGFloat
    var titleFont: Font
    var subtitleFont: Font

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            Image("WidgetLogo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: logoSize, height: logoSize)
                .clipShape(RoundedRectangle(cornerRadius: logoSize * 0.22))
                .padding(.bottom, 10)

            Text("TidyWise")
                .font(titleFont)
                .foregroundColor(.white)
                .padding(.bottom, 3)

            Text("Tap to schedule")
                .font(subtitleFont)
                .foregroundColor(.white.opacity(0.5))

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(brandGradient)
        .widgetURL(URL(string: "tidywise://new-booking"))
    }
}

// MARK: - Small (2x2)

struct SmallWidgetView: View {
    var entry: BookingEntry

    var body: some View {
        if entry.booking.isEmpty {
            EmptyStateView(
                logoSize: 36,
                titleFont: .system(size: 15, weight: .bold),
                subtitleFont: .system(size: 11, weight: .medium)
            )
        } else {
            VStack(alignment: .leading) {
                BookingInfoStack(
                    entry: entry,
                    timeFont: .system(size: 12, weight: .medium),
                    nameFont: .system(size: 17, weight: .bold),
                    serviceFont: .system(size: 12, weight: .medium),
                    addressFont: .system(size: 11)
                )
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(brandGradient)
            .widgetURL(URL(string: "tidywise://booking/\(entry.booking.bookingId ?? "")"))
        }
    }
}

// MARK: - Medium (4x2)

struct MediumWidgetView: View {
    var entry: BookingEntry

    var body: some View {
        if entry.booking.isEmpty {
            EmptyStateView(
                logoSize: 38,
                titleFont: .system(size: 17, weight: .bold),
                subtitleFont: .system(size: 12, weight: .medium)
            )
        } else {
            HStack(spacing: 0) {
                // Left: logo header + four lines
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 6) {
                        Image("WidgetLogo")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 20, height: 20)
                            .clipShape(RoundedRectangle(cornerRadius: 5))

                        Text("Next Booking")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white.opacity(0.5))
                    }
                    .padding(.bottom, 10)

                    BookingInfoStack(
                        entry: entry,
                        timeFont: .system(size: 13, weight: .medium),
                        nameFont: .system(size: 20, weight: .bold),
                        serviceFont: .system(size: 13, weight: .medium),
                        addressFont: .system(size: 12)
                    )

                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)

                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(brandGradient)
            .widgetURL(URL(string: "tidywise://booking/\(entry.booking.bookingId ?? "")"))
        }
    }
}

// MARK: - Large (4x4)

struct LargeWidgetView: View {
    var entry: BookingEntry

    var body: some View {
        if entry.booking.isEmpty {
            EmptyStateView(
                logoSize: 48,
                titleFont: .system(size: 20, weight: .bold),
                subtitleFont: .system(size: 14, weight: .medium)
            )
        } else {
            VStack(alignment: .leading, spacing: 0) {
                // Header
                HStack(spacing: 8) {
                    Image("WidgetLogo")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 24, height: 24)
                        .clipShape(RoundedRectangle(cornerRadius: 6))

                    Text("Next Booking")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white.opacity(0.5))

                    Spacer()
                }
                .padding(.bottom, 20)

                // Time
                Text(formatDate(entry.booking.scheduledAt))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white.opacity(0.75))
                    .lineLimit(1)
                    .padding(.bottom, 4)

                // Customer — hero size
                Text(entry.booking.customerName ?? "Unknown")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .padding(.bottom, 6)

                // Divider
                Rectangle()
                    .fill(Color.white.opacity(0.12))
                    .frame(height: 1)
                    .padding(.bottom, 12)

                // Service
                HStack(spacing: 6) {
                    Image(systemName: "bubbles.and.sparkles.fill")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.45))
                    Text(entry.booking.serviceType ?? "Cleaning")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)
                }
                .padding(.bottom, 8)

                // Address
                if let addr = entry.booking.address, !addr.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.45))
                        Text(addr)
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.55))
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(brandGradient)
            .widgetURL(URL(string: "tidywise://booking/\(entry.booking.bookingId ?? "")"))
        }
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
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct WidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: BookingEntry

    var body: some View {
        switch family {
        case .systemMedium:
            MediumWidgetView(entry: entry)
        case .systemLarge:
            LargeWidgetView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
    }
}
