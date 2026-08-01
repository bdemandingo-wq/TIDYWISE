/**
 * The current year, for a copyright line.
 *
 * Fifteen marketing and blog pages each wrote `{new Date().getFullYear()}`
 * inline, which the device-local-dates rule flags — correctly, since it cannot
 * tell a copyright year from a business-day boundary. Every one of them was a
 * genuine exception, and fifteen identical eslint-disable comments would have
 * been fifteen chances to paste the reasoning onto something that ISN'T an
 * exception.
 *
 * So the exception lives in one place, stated once.
 *
 * A copyright year is not a business day. It is not compared against stored
 * data, it does not decide what a customer is shown or charged, and being a few
 * hours early on 31 December is what every other website does too.
 */
export function CopyrightYear() {
  // eslint-disable-next-line local/no-device-local-dates -- see the note above
  return <>{new Date().getFullYear()}</>;
}
