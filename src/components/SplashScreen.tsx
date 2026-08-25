/**
 * SPLASH SCREEN - Branded loading screen
 * 
 * Shows a clean logo animation while auth state is being determined
 * Prevents flash of login/signup forms
 */

import { useEffect, useRef, useState } from 'react';
import tidywiseLogo from '/images/tidywise-logo.webp';

interface SplashScreenProps {
  onComplete?: () => void;
  minDuration?: number;
}

export function SplashScreen({ onComplete, minDuration = 800 }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  // Store onComplete in a ref so the timer effect doesn't depend on the
  // callback identity. Without this, every parent re-render that creates a
  // new onComplete reference resets the timer and the splash never dismisses.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      if (onCompleteRef.current) {
        setTimeout(onCompleteRef.current, 300);
      }
    }, minDuration);

    return () => clearTimeout(timer);
  }, [minDuration]);

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-300 ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Logo with pulse animation */}
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 blur-2xl bg-primary/20 rounded-full scale-150 animate-pulse" />
          
          {/* Logo */}
          <div className="relative animate-[scale-in_0.5s_ease-out]">
            <img
              src={tidywiseLogo}
              alt="TIDYWISE"
              className="h-20 w-auto object-contain"
              width={1024}
              height={1024}
              fetchPriority="high"
            />
          </div>
        </div>
        
        {/* Brand name */}
        <div className="flex flex-col items-center gap-2 animate-[fade-in_0.6s_ease-out_0.2s_both]">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            TIDYWISE
          </h1>
          <p className="text-sm text-muted-foreground">
            Cleaning Business Management
          </p>
        </div>
        
        {/* Loading indicator */}
        <div className="flex gap-1.5 animate-[fade-in_0.6s_ease-out_0.4s_both]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full bg-primary"
              style={{
                animation: `bounce 1s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
      
      <style>{`
        @keyframes scale-in {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-6px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
