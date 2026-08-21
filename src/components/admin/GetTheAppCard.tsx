import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Download, Smartphone } from 'lucide-react';

/**
 * The permanent, findable way to reach /get-the-app from inside the product.
 *
 * Until now the only link to that page was in SiteFooter — on the marketing
 * site, which a signed-in customer working out of /dashboard all day never
 * sees. The page itself has existed and been reachable by URL only.
 *
 * Renders on every platform, unlike its neighbour AppUpdateCard (native only).
 * "Which devices can I run this on" is a reasonable question to have on a phone,
 * and the answer includes the desktop install — someone reading this in the iOS
 * app is exactly the person who might want TidyWise on their Mac too. So there
 * is no platform on which this card is noise.
 *
 * Deliberately points at /get-the-app rather than at a store URL. That page
 * platform-detects and holds every option; hardcoding a second copy of the
 * App Store link here would mean two places to update when Android lands.
 */
export function GetTheAppCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Get the app
        </CardTitle>
        <CardDescription>
          TidyWise on your phone and your desktop — same account, same data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="gap-2 min-h-[44px]">
          <Link to="/get-the-app">
            <Download className="w-4 h-4" />
            See your options
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
