import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface OrganizationPricingSettings {
  id?: string;
  organization_id: string;
  show_sqft_on_booking: boolean;
  show_addons_on_booking: boolean;
  show_frequency_discount: boolean;
  show_pet_options: boolean;
  show_home_condition: boolean;
  show_bed_bath_on_booking: boolean;
  sales_tax_percent: number;
  demo_mode_enabled: boolean;
  loyalty_program_enabled: boolean;
  combined_pricing_enabled: boolean;
  booking_form_theme: string;
  form_bg_color: string | null;
  form_card_color: string | null;
  form_text_color: string | null;
  form_button_color: string | null;
  form_button_text_color: string | null;
  form_accent_color: string | null;
}

const defaultSettings: Omit<OrganizationPricingSettings, 'organization_id'> = {
  show_sqft_on_booking: true,
  show_addons_on_booking: true,
  show_frequency_discount: true,
  show_pet_options: true,
  show_home_condition: true,
  show_bed_bath_on_booking: true,
  sales_tax_percent: 0,
  demo_mode_enabled: false,
  loyalty_program_enabled: true,
  combined_pricing_enabled: false,
  booking_form_theme: 'dark',
  form_bg_color: null,
  form_card_color: null,
  form_text_color: null,
  form_button_color: null,
  form_button_text_color: null,
  form_accent_color: null,
};

export function useOrganizationSettings() {
  const { organization } = useOrganization();
  const [settings, setSettings] = useState<OrganizationPricingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!organization?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('organization_pricing_settings')
        .select('*')
        .eq('organization_id', organization.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          id: data.id,
          organization_id: data.organization_id,
          show_sqft_on_booking: data.show_sqft_on_booking ?? true,
          show_addons_on_booking: data.show_addons_on_booking ?? true,
          show_frequency_discount: data.show_frequency_discount ?? true,
          show_pet_options: data.show_pet_options ?? true,
          show_home_condition: data.show_home_condition ?? true,
          show_bed_bath_on_booking: data.show_bed_bath_on_booking ?? true,
          sales_tax_percent: Number(data.sales_tax_percent) || 0,
          demo_mode_enabled: data.demo_mode_enabled ?? false,
          loyalty_program_enabled: (data as any).loyalty_program_enabled ?? true,
          combined_pricing_enabled: (data as any).combined_pricing_enabled ?? false,
          booking_form_theme: (data as any).booking_form_theme ?? 'dark',
          form_bg_color: (data as any).form_bg_color ?? null,
          form_card_color: (data as any).form_card_color ?? null,
          form_text_color: (data as any).form_text_color ?? null,
          form_button_color: (data as any).form_button_color ?? null,
          form_button_text_color: (data as any).form_button_text_color ?? null,
          form_accent_color: (data as any).form_accent_color ?? null,
        });
      } else {
        // Create default settings
        setSettings({
          organization_id: organization.id,
          ...defaultSettings,
        });
      }
    } catch (error) {
      console.error('Error fetching organization settings:', error);
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (updates: Partial<OrganizationPricingSettings>) => {
    if (!organization?.id) return;

    try {
      const settingsData = {
        organization_id: organization.id,
        show_sqft_on_booking: updates.show_sqft_on_booking ?? settings?.show_sqft_on_booking ?? true,
        show_addons_on_booking: updates.show_addons_on_booking ?? settings?.show_addons_on_booking ?? true,
        show_frequency_discount: updates.show_frequency_discount ?? settings?.show_frequency_discount ?? true,
        show_pet_options: updates.show_pet_options ?? settings?.show_pet_options ?? true,
        show_home_condition: updates.show_home_condition ?? settings?.show_home_condition ?? true,
        show_bed_bath_on_booking: updates.show_bed_bath_on_booking ?? settings?.show_bed_bath_on_booking ?? true,
        sales_tax_percent: updates.sales_tax_percent ?? settings?.sales_tax_percent ?? 0,
        demo_mode_enabled: updates.demo_mode_enabled ?? settings?.demo_mode_enabled ?? false,
        loyalty_program_enabled: updates.loyalty_program_enabled ?? settings?.loyalty_program_enabled ?? true,
        combined_pricing_enabled: updates.combined_pricing_enabled ?? settings?.combined_pricing_enabled ?? false,
        booking_form_theme: updates.booking_form_theme ?? settings?.booking_form_theme ?? 'dark',
        form_bg_color: updates.form_bg_color !== undefined ? updates.form_bg_color : (settings?.form_bg_color ?? null),
        form_card_color: updates.form_card_color !== undefined ? updates.form_card_color : (settings?.form_card_color ?? null),
        form_text_color: updates.form_text_color !== undefined ? updates.form_text_color : (settings?.form_text_color ?? null),
        form_button_color: updates.form_button_color !== undefined ? updates.form_button_color : (settings?.form_button_color ?? null),
        form_button_text_color: updates.form_button_text_color !== undefined ? updates.form_button_text_color : (settings?.form_button_text_color ?? null),
        form_accent_color: updates.form_accent_color !== undefined ? updates.form_accent_color : (settings?.form_accent_color ?? null),
      };

      const { data, error } = await supabase
        .from('organization_pricing_settings')
        .upsert(settingsData as any, {
          onConflict: 'organization_id',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (error) throw error;

      setSettings({
        id: data.id,
        organization_id: data.organization_id,
        show_sqft_on_booking: data.show_sqft_on_booking ?? true,
        show_addons_on_booking: data.show_addons_on_booking ?? true,
        show_frequency_discount: data.show_frequency_discount ?? true,
        show_pet_options: data.show_pet_options ?? true,
        show_home_condition: data.show_home_condition ?? true,
        show_bed_bath_on_booking: data.show_bed_bath_on_booking ?? true,
        sales_tax_percent: Number(data.sales_tax_percent) || 0,
        demo_mode_enabled: data.demo_mode_enabled ?? false,
        loyalty_program_enabled: (data as any).loyalty_program_enabled ?? true,
        combined_pricing_enabled: (data as any).combined_pricing_enabled ?? false,
        booking_form_theme: (data as any).booking_form_theme ?? 'dark',
        form_bg_color: (data as any).form_bg_color ?? null,
        form_card_color: (data as any).form_card_color ?? null,
        form_text_color: (data as any).form_text_color ?? null,
        form_button_color: (data as any).form_button_color ?? null,
        form_button_text_color: (data as any).form_button_text_color ?? null,
        form_accent_color: (data as any).form_accent_color ?? null,
      });

      return true;
    } catch (error) {
      console.error('Error saving organization settings:', error);
      return false;
    }
  };

  const toggleDemoMode = async () => {
    const newValue = !settings?.demo_mode_enabled;
    return saveSettings({ demo_mode_enabled: newValue });
  };

  return {
    settings,
    loading,
    saveSettings,
    toggleDemoMode,
    refetch: fetchSettings,
  };
}
