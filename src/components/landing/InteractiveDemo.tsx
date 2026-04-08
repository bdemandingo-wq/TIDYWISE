import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Play } from "lucide-react";

export function InteractiveDemo() {
  const navigate = useNavigate();

  const handleStartFree = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/signup");
  };

  return (
    <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4">
            <Play className="h-4 w-4" />
            Watch Demo
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            See TidyWise in Action
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Watch a full walkthrough of TIDYWISE before you sign up. See how it can transform your cleaning business.
          </p>
        </div>

        {/* Video Container */}
        <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl border border-border">
          <div className="aspect-video">
            <iframe
              src="https://www.loom.com/embed/faef0b008912405c81d2b67bd5d59491"
              frameBorder="0"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <Button size="lg" onClick={handleStartFree}>
            Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            No credit card required. Free forever.
          </p>
        </div>
      </div>
    </section>
  );
}
