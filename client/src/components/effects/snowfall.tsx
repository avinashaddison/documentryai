import { useEffect, useState } from "react";

interface Particle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
  drift: number;
  type: "snow" | "confetti" | "sparkle";
  color: string;
  rotation: number;
}

const confettiColors = [
  "#7163EB", // purple
  "#d946ef", // fuchsia
  "#FFD700", // gold
  "#06b6d4", // cyan
  "#f472b6", // pink
  "#a855f7", // violet
  "#fbbf24", // amber
  "#ffffff", // white
];

export function Snowfall() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const allParticles: Particle[] = [];
    
    // Snow particles
    for (let i = 0; i < 30; i++) {
      allParticles.push({
        id: i,
        x: Math.random() * 100,
        size: Math.random() * 4 + 2,
        duration: Math.random() * 10 + 10,
        delay: Math.random() * 10,
        opacity: Math.random() * 0.4 + 0.3,
        drift: Math.random() * 30 - 15,
        type: "snow",
        color: "#ffffff",
        rotation: 0
      });
    }
    
    // Confetti particles
    for (let i = 30; i < 55; i++) {
      allParticles.push({
        id: i,
        x: Math.random() * 100,
        size: Math.random() * 8 + 4,
        duration: Math.random() * 8 + 6,
        delay: Math.random() * 12,
        opacity: Math.random() * 0.6 + 0.4,
        drift: Math.random() * 60 - 30,
        type: "confetti",
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        rotation: Math.random() * 360
      });
    }
    
    // Sparkle particles
    for (let i = 55; i < 70; i++) {
      allParticles.push({
        id: i,
        x: Math.random() * 100,
        size: Math.random() * 3 + 2,
        duration: Math.random() * 3 + 2,
        delay: Math.random() * 8,
        opacity: Math.random() * 0.8 + 0.2,
        drift: Math.random() * 10 - 5,
        type: "sparkle",
        color: Math.random() > 0.5 ? "#FFD700" : "#ffffff",
        rotation: 0
      });
    }
    
    setParticles(allParticles);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((particle) => {
        if (particle.type === "snow") {
          return (
            <div
              key={particle.id}
              className="absolute rounded-full animate-snowfall"
              style={{
                left: `${particle.x}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                backgroundColor: particle.color,
                opacity: particle.opacity,
                animationDuration: `${particle.duration}s`,
                animationDelay: `${particle.delay}s`,
                ["--drift" as string]: `${particle.drift}px`,
                boxShadow: particle.size > 3 
                  ? `0 0 ${particle.size * 2}px rgba(113, 99, 235, 0.4)` 
                  : 'none'
              }}
            />
          );
        }
        
        if (particle.type === "confetti") {
          return (
            <div
              key={particle.id}
              className="absolute animate-confetti"
              style={{
                left: `${particle.x}%`,
                width: `${particle.size}px`,
                height: `${particle.size * 0.6}px`,
                backgroundColor: particle.color,
                opacity: particle.opacity,
                animationDuration: `${particle.duration}s`,
                animationDelay: `${particle.delay}s`,
                ["--drift" as string]: `${particle.drift}px`,
                ["--rotation" as string]: `${particle.rotation}deg`,
                borderRadius: "2px",
                boxShadow: `0 0 ${particle.size}px ${particle.color}40`
              }}
            />
          );
        }
        
        if (particle.type === "sparkle") {
          return (
            <div
              key={particle.id}
              className="absolute animate-sparkle"
              style={{
                left: `${particle.x}%`,
                top: `${Math.random() * 100}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                animationDuration: `${particle.duration}s`,
                animationDelay: `${particle.delay}s`,
              }}
            >
              <svg viewBox="0 0 24 24" fill={particle.color} className="w-full h-full">
                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
              </svg>
            </div>
          );
        }
        
        return null;
      })}
    </div>
  );
}
