import { registerPlugin } from '@capacitor/core';

export interface WidgetBridgePlugin {
  syncBookingData(options: { json: string }): Promise<void>;
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');

export default WidgetBridge;
