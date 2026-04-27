import { useEffect } from 'react';

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

type Props = {
  metaPixelId?: string | null;
  googleAnalyticsId?: string | null;
};

/**
 * Injects per-organization Meta Pixel and Google Analytics tracking
 * scripts into the document head. Idempotent — safe to mount multiple
 * times; each ID is only injected once per page lifecycle.
 *
 * Used on public-facing pages (e.g. the public booking form, deposit,
 * tip, and review pages) so each organization's ads manager can track
 * conversions without needing admin access to the CRM.
 */
export function TrackingPixels({ metaPixelId, googleAnalyticsId }: Props) {
  useEffect(() => {
    if (!metaPixelId) return;
    const flagId = `meta-pixel-${metaPixelId}`;
    if (document.getElementById(flagId)) return;

    const script = document.createElement('script');
    script.id = flagId;
    script.innerHTML = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${metaPixelId}');
      fbq('track', 'PageView');
    `;
    document.head.appendChild(script);

    const noscript = document.createElement('noscript');
    noscript.id = `${flagId}-noscript`;
    noscript.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1" alt="" />`;
    document.body.appendChild(noscript);
  }, [metaPixelId]);

  useEffect(() => {
    if (!googleAnalyticsId) return;
    const flagId = `ga-${googleAnalyticsId}`;
    if (document.getElementById(flagId)) return;

    const loader = document.createElement('script');
    loader.id = `${flagId}-loader`;
    loader.async = true;
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`;
    document.head.appendChild(loader);

    const inline = document.createElement('script');
    inline.id = flagId;
    inline.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${googleAnalyticsId}');
    `;
    document.head.appendChild(inline);
  }, [googleAnalyticsId]);

  return null;
}

/**
 * Fire a conversion event to both Meta Pixel and Google Analytics.
 * Safely no-ops if neither pixel is loaded.
 */
export function trackConversion(
  eventName: 'Purchase' | 'Lead' | 'InitiateCheckout' | 'AddToCart' | 'CompleteRegistration',
  params?: { value?: number; currency?: string; content_name?: string; transaction_id?: string },
) {
  const value = params?.value ?? 0;
  const currency = params?.currency ?? 'USD';

  // Meta Pixel
  try {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', eventName, {
        value,
        currency,
        ...(params?.content_name ? { content_name: params.content_name } : {}),
      });
    }
  } catch (err) {
    console.warn('Meta Pixel event failed:', err);
  }

  // Google Analytics 4 — map Meta event names to GA4 standard events
  try {
    if (typeof window !== 'undefined' && window.gtag) {
      const gaEventMap: Record<string, string> = {
        Purchase: 'purchase',
        Lead: 'generate_lead',
        InitiateCheckout: 'begin_checkout',
        AddToCart: 'add_to_cart',
        CompleteRegistration: 'sign_up',
      };
      const gaEvent = gaEventMap[eventName] || eventName.toLowerCase();
      window.gtag('event', gaEvent, {
        value,
        currency,
        ...(params?.transaction_id ? { transaction_id: params.transaction_id } : {}),
        ...(params?.content_name ? { items: [{ item_name: params.content_name }] } : {}),
      });
    }
  } catch (err) {
    console.warn('GA event failed:', err);
  }
}
