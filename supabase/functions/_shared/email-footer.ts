// Shared CAN-SPAM-compliant footer for all TidyWise platform emails.
//
// CAN-SPAM (15 U.S.C. § 7704) requires every commercial email to
// include:
//   1. A valid physical postal address of the sender
//   2. A clear way to opt out of further commercial messages
//
// Transactional emails (welcome, receipt, password reset, etc.) are
// exempt from the opt-out requirement, but Gmail / Outlook deliverability
// scoring still rewards having one. Including it on every email also
// keeps the policy simple: one footer, always.
//
// PLACEHOLDER: replace TIDYWISE_MAILING_ADDRESS with the real PO Box
// before going wide on email sends. A virtual mailbox service
// (iPostal1, Earth Class Mail) costs ~$10/mo and gives a real street
// address without exposing the founder's home.

export const TIDYWISE_MAILING_ADDRESS = "TidyWise, P.O. Box [TODO], FL";
export const TIDYWISE_SUPPORT_EMAIL = "support@tidywisecleaning.com";

const UNSUBSCRIBE_HREF = `mailto:${TIDYWISE_SUPPORT_EMAIL}?subject=Unsubscribe`;

/**
 * HTML footer for branded TidyWise emails. Drop into the bottom of any
 * email <body> before the closing tag.
 */
export function tidywiseEmailFooterHtml(): string {
  return `
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
    <p style="color: #888; font-size: 12px; line-height: 1.5; text-align: center; margin: 0 0 8px;">
      ${TIDYWISE_MAILING_ADDRESS}
    </p>
    <p style="color: #888; font-size: 12px; line-height: 1.5; text-align: center; margin: 0;">
      You're receiving this because you have a TidyWise account.
      <a href="${UNSUBSCRIBE_HREF}" style="color: #888;">Unsubscribe</a>
      ·
      <a href="mailto:${TIDYWISE_SUPPORT_EMAIL}" style="color: #888;">${TIDYWISE_SUPPORT_EMAIL}</a>
    </p>`;
}

/**
 * Plain-text footer for emails that send a text alternative. Same data
 * as the HTML version, no markup.
 */
export function tidywiseEmailFooterText(): string {
  return [
    "",
    "----------",
    TIDYWISE_MAILING_ADDRESS,
    `Unsubscribe: ${UNSUBSCRIBE_HREF}`,
    `Support: ${TIDYWISE_SUPPORT_EMAIL}`,
  ].join("\n");
}
