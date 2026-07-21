
CREATE OR REPLACE FUNCTION public.get_public_booking_settings(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'surge_weekend_enabled', bs.surge_weekend_enabled,
    'surge_weekend_multiplier', bs.surge_weekend_multiplier,
    'surge_lastminute_enabled', bs.surge_lastminute_enabled,
    'surge_lastminute_hours', bs.surge_lastminute_hours,
    'surge_lastminute_multiplier', bs.surge_lastminute_multiplier,
    'surge_holiday_enabled', bs.surge_holiday_enabled,
    'surge_holiday_multiplier', bs.surge_holiday_multiplier,
    'meta_pixel_id', bs.meta_pixel_id,
    'google_analytics_id', bs.google_analytics_id,
    'recurring_discount_one_time', bs.recurring_discount_one_time,
    'recurring_discount_monthly', bs.recurring_discount_monthly,
    'recurring_discount_biweekly', bs.recurring_discount_biweekly,
    'recurring_discount_weekly', bs.recurring_discount_weekly,
    'scheduling_mode', COALESCE(bs.scheduling_mode, 'specific'),
    'arrival_windows', COALESCE(bs.arrival_windows, '[]'::jsonb),
    'pet_fee', COALESCE(ops.pet_fee, 25),
    'pet_toggle_enabled', COALESCE(ops.pet_toggle_enabled, true),
    'excluded_room_types', COALESCE(ops.excluded_room_types, '{}'::text[]),
    'room_reduction_prices', COALESCE(ops.room_reduction_prices,
      '{"bedroom":25,"bathroom":20,"full_bath":25}'::jsonb),
    'custom_frequencies', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', cf.id,
            'name', cf.name,
            'interval_days', cf.interval_days,
            'days_of_week', cf.days_of_week,
            'is_active', cf.is_active,
            'discount_pct', cf.discount_pct
          )
          ORDER BY cf.interval_days ASC
        )
        FROM public.custom_frequencies cf
        WHERE cf.organization_id = p_org_id AND cf.is_active = true
      ),
      '[]'::jsonb
    )
  )
  FROM public.business_settings bs
  LEFT JOIN public.organization_pricing_settings ops
    ON ops.organization_id = bs.organization_id
  WHERE bs.organization_id = p_org_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_booking_settings(uuid) TO anon, authenticated;
