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
            call.reject("Missing 'json' parameter")
            return
        }

        let key = call.getString("key") ?? "widgetNextBooking"

        guard let defaults = UserDefaults(suiteName: "group.com.TidyWiseApp.app") else {
            call.reject("Could not access App Group UserDefaults")
            return
        }

        defaults.set(json, forKey: key)
        defaults.synchronize()

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve()
    }
}
