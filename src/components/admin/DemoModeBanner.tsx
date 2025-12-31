import { FlaskConical } from 'lucide-react';

export function DemoModeBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-950 py-1.5 px-4 text-center text-sm font-medium flex items-center justify-center gap-2">
      <FlaskConical className="w-4 h-4" />
      <span>Demo Mode Active - Changes will be flagged as test data</span>
    </div>
  );
}
