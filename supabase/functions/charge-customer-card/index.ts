import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface HoldCardRequest {
  email: string;
  amount: number;
  description?: string;
  bookingId?: string;
  organizationId: string;
}

// Map Stripe decline codes to user-friendly messages
const DECLINE_CODE_MESSAGES: Record<string, string> = {
  insufficient_funds: "Insufficient funds - The card does not have enough balance to complete this transaction.",
  card_declined: "Card declined - The card was declined by the issuing bank.",
  expired_card: "Expired card - This card has expired. Please use a different card.",
  incorrect_cvc: "Incorrect CVC - The security code entered is incorrect.",
  incorrect_number: "Invalid card number - Please check the card number and try again.",
  incorrect_zip: "Incorrect ZIP code - The ZIP code does not match the card.",
  card_not_supported: "Card not supported - This type of card is not accepted.",
  currency_not_supported: "Currency not supported - This card does not support USD transactions.",
  duplicate_transaction: "Duplicate transaction - A similar transaction was recently processed.",
  fraudulent: "Transaction blocked - This transaction was flagged as potentially fraudulent.",
  generic_decline: "Card declined - Please contact your bank or use a different card.",
  invalid_account: "Invalid account - The card account is invalid.",
  invalid_amount: "Invalid amount - The payment amount is not valid.",
  issuer_not_available: "Issuer unavailable - The card issuer could not be reached. Please try again.",
  lost_card: "Card reported lost - This card has been reported lost. Please use a different card.",
  stolen_card: "Card reported stolen - This card has been reported stolen. Please use a different card.",
  merchant_blacklist: "Card restricted - This card cannot be used for this purchase.",
  new_account_information_available: "Card information updated - Please re-enter your card details.",
  no_action_taken: "No action taken - The bank did not process the transaction.",
  not_permitted: "Transaction not permitted - This transaction is not allowed on this card.",
  offline_pin_required: "PIN required - This transaction requires a PIN.",
  online_or_offline_pin_required: "PIN required - Please try again with your PIN.",
  pickup_card: "Card pickup - This card has been flagged for pickup. Please contact your bank.",
  pin_try_exceeded: "PIN tries exceeded - Too many incorrect PIN attempts.",
  processing_error: "Processing error - An error occurred. Please try again.",
  reenter_transaction: "Please try again - Re-enter the transaction.",
  restricted_card: "Restricted card - This card has restrictions that prevent this transaction.",
  revocation_of_all_authorizations: "Card revoked - All authorizations have been revoked.",
  revocation_of_authorization: "Authorization revoked - Please use a different card.",
  security_violation: "Security violation - This transaction was blocked for security reasons.",
  service_not_allowed: "Service not allowed - This card is not allowed for this type of purchase.",
  stop_payment_order: "Stop payment - A stop payment order is on this card.",
  testmode_decline: "Test card - This is a test card. Please use a real card.",
  transaction_not_allowed: "Transaction not allowed - Please contact your bank.",
  try_again_later: "Temporarily unavailable - Please try again later.",
  withdrawal_count_limit_exceeded: "Withdrawal limit exceeded - You've reached your daily transaction limit.",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, amount, description, bookingId, organizationId }: HoldCardRequest = await req.json();

    console.log("Placing hold on customer card:", { email, amount, description, bookingId, organizationId });

    if (!email || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields (email and amount)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // CRITICAL SECURITY: Require organizationId to prevent cross-tenant card access
    if (!organizationId) {
      console.error("SECURITY: Missing organizationId in charge-customer-card request");
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Organization ID is required for security",
          errorCode: "missing_organization"
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // SECURITY FIX: Look for customer with matching email AND organization_id in metadata
    const customers = await stripe.customers.list({ email: email, limit: 100 });
    
    // Find customer that belongs to THIS organization
    const orgCustomer = customers.data.find((c: Stripe.Customer) => {
      return c.metadata?.organization_id === organizationId;
    });
    
    if (!orgCustomer) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Customer not found for this organization. Please save a card first.",
          errorCode: "customer_not_found"
        }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const customerId = orgCustomer.id;
    console.log("Found org-specific customer:", customerId);

    // Get the customer's default payment method
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Customer has been deleted",
          errorCode: "customer_deleted"
        }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let paymentMethodId = customer.invoice_settings?.default_payment_method as string;
    
    if (!paymentMethodId) {
      // Try to get any attached payment method
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });

      if (paymentMethods.data.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: "No payment method on file for this customer. Please add a card first.",
            errorCode: "no_payment_method"
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      paymentMethodId = paymentMethods.data[0].id;
    }

    // Create a payment intent with capture_method: 'manual' to place a hold without charging
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      capture_method: "manual", // This places a hold but doesn't capture (charge) the funds
      description: description || "Cleaning service hold",
      metadata: {
        bookingId: bookingId || "",
        organization_id: organizationId,
      },
    });

    console.log("Hold placed successfully:", paymentIntent.id, "Status:", paymentIntent.status);

    // Check if the hold was successful
    if (paymentIntent.status === "requires_capture") {
      return new Response(JSON.stringify({ 
        success: true, 
        paymentIntentId: paymentIntent.id,
        status: "hold_placed",
        amount: amount,
        message: `Hold of $${amount.toFixed(2)} placed successfully. Card will be charged after service completion.`
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        error: "Failed to place hold on card. Unexpected status: " + paymentIntent.status
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  } catch (error: any) {
    console.error("Error in charge-customer-card function:", error);
    
    // Handle specific Stripe errors with detailed messages
    if (error.type === "StripeCardError") {
      const declineCode = error.decline_code || error.code || "unknown";
      const friendlyMessage = DECLINE_CODE_MESSAGES[declineCode] || error.message || "Card was declined";
      
      console.log("Card declined with code:", declineCode);
      
      return new Response(
        JSON.stringify({ 
          success: false,
          declined: true,
          error: friendlyMessage,
          declineCode: declineCode,
          rawMessage: error.message
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (error.type === "StripeInvalidRequestError") {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Invalid request: " + error.message,
          errorCode: "invalid_request"
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "An unexpected error occurred",
        errorCode: "server_error"
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
