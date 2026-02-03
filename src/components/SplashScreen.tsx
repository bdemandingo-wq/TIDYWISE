/**
 * SPLASH SCREEN - Branded loading screen
 * 
 * Shows a clean logo animation while auth state is being determined
 * Prevents flash of login/signup forms
 */

import { useEffect, useState } from 'react';
import splashLogo from '@/assets/splash-logo.png';

interface SplashScreenProps {
  onComplete?: () => void;
  minDuration?: number;
}

export function SplashScreen({ onComplete, minDuration = 800 }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      if (onComplete) {
        setTimeout(onComplete, 300); // Wait for fade animation
      }
    }, minDuration);

    return () => clearTimeout(timer);
  }, [minDuration, onComplete]);

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-300 ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Logo with pulse animation */}
        <div className="relative animate-[scale-in_0.5s_ease-out]">
          {/* Glow effect */}
          <div className="absolute inset-0 blur-2xl bg-primary/20 rounded-full scale-150 animate-pulse" />
        </div>
        
        {/* Brand logo */}
        <div className="animate-[fade-in_0.6s_ease-out_0.2s_both]">
          <img 
            src={splashLogo} 
            alt="TIDYWISE" 
            className="h-32 w-auto object-contain"
          />
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
