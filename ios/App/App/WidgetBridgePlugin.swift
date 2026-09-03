import Capacitor
import WidgetKit

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncBookingData", returnType: CAPPluginReturnPromise)
    ]

    @objc func syncBookingData(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            print("[WidgetBridge] REJECTED: missing 'json' parameter")
            call.reject("Missing 'json' parameter")
            return
        }

        let key = call.getString("key") ?? "widgetNextBooking"
        print("[WidgetBridge] writing key='\(key)' json=\(json.prefix(200))")

        guard let defaults = UserDefaults(suiteName: "group.com.TidyWiseApp.app") else {
            print("[WidgetBridge] REJECTED: could not access App Group UserDefaults")
            call.reject("Could not access App Group UserDefaults")
            return
        }

        defaults.set(json, forKey: key)
        defaults.synchronize()

        // Verify the write
        let readBack = defaults.string(forKey: key)
        print("[WidgetBridge] verify read-back for '\(key)': \(readBack != nil ? "OK (\(readBack!.count) chars)" : "NIL")")

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
            print("[WidgetBridge] reloaded all timelines")
        }

        call.resolve()
    }
}
