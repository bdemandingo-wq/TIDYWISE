// TidyWise email brand tokens — shared across all auth email templates.
export const BRAND = {
  logoUrl: 'https://jointidywise.lovable.app/email-logo.png',
  logoHeight: 80,
  primary: '#1E5FBF',
  primaryHover: '#1A52A8',
  accent: '#4CAF3F',
  bg: '#ffffff',
  card: '#f9fafb',
  body: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  codeBg: '#f3f4f6',
}

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export const styles = {
  main: { backgroundColor: BRAND.bg, fontFamily: fontStack, margin: 0, padding: 0 },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '32px 24px',
  },
  logoWrap: { textAlign: 'center' as const, padding: '8px 0 24px' },
  logo: { height: `${BRAND.logoHeight}px`, width: 'auto', margin: '0 auto' },
  card: {
    backgroundColor: BRAND.card,
    border: `1px solid ${BRAND.border}`,
    borderRadius: '12px',
    padding: '32px 28px',
  },
  h1: {
    fontSize: '24px',
    fontWeight: 700 as const,
    color: BRAND.body,
    margin: '0 0 16px',
    lineHeight: '1.3',
  },
  text: {
    fontSize: '15px',
    color: BRAND.body,
    lineHeight: '1.6',
    margin: '0 0 20px',
  },
  link: { color: BRAND.primary, textDecoration: 'underline' },
  button: {
    backgroundColor: BRAND.primary,
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600 as const,
    borderRadius: '8px',
    padding: '14px 28px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  buttonWrap: { textAlign: 'center' as const, margin: '24px 0' },
  codeBox: {
    backgroundColor: BRAND.codeBg,
    border: `1px solid ${BRAND.border}`,
    borderRadius: '10px',
    padding: '20px 24px',
    margin: '24px 0',
    textAlign: 'center' as const,
  },
  code: {
    fontSize: '36px',
    fontWeight: 700 as const,
    letterSpacing: '10px',
    color: BRAND.primary,
    margin: 0,
    textAlign: 'center' as const,
  },
  hint: {
    fontSize: '13px',
    color: BRAND.muted,
    lineHeight: '1.5',
    margin: '20px 0 0',
  },
  footer: {
    borderTop: `2px solid ${BRAND.accent}`,
    marginTop: '32px',
    paddingTop: '20px',
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: '12px',
    color: BRAND.muted,
    margin: '0 0 4px',
    lineHeight: '1.5',
  },
}
