import { useState } from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { toast } from "@/hooks/use-toast";
import { FunctionsHttpError } from "@supabase/supabase-js";

interface Props extends Omit<ButtonProps, "onClick"> {
  label?: string;
}

/**
 * Opens Stripe Checkout in a new tab for a $10 / 500-credit top-up.
 * Charges the PLATFORM Stripe account.
 */
export function BuyAiCreditsButton({
  label = "Buy 500 credits — $10",
  size = "default",
  variant = "default",
  ...rest
}: Props) {
  const { organizationId } = useOrgId();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!organizationId) {
      toast({ title: "No organization selected", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("buy-ai-credits", {
        body: { organizationId },
      });
      if (error) {
        const details = error instanceof FunctionsHttpError
          ? await error.context.text()
          : error.message;
        throw new Error(details || "Failed to start checkout");
      }
      if (!data?.url) throw new Error("Checkout URL missing from response");
      window.open(data.url, "_blank");
    } catch (e) {
      toast({
        title: "Couldn't start checkout",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size={size} variant={variant} onClick={handleClick} disabled={loading} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      <span className="ml-2">{label}</span>
    </Button>
  );
}
