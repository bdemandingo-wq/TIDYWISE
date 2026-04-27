import { useEffect } from 'react';

type Props = {
  metaPixelId?: string | null;
  googleAnalyticsId?: string | null;
};

/**
 * Injects per-organization Meta Pixel and Google Analytics tracking
 * scripts into the document head. Idempotent — safe to mount multiple
 * times; each ID is only injected once per page lifecycle.
 *
 * Used on public-facing pages (e.g. the public booking form) so each
 * organization's ads manager can track conversions without needing
 * admin access to the CRM.
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
