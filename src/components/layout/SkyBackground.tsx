import { useEffect, useMemo, useState } from 'react';
import { sceneForHour, type Scene } from './scene';

/**
 * The sky.
 *
 * Painted entirely with CSS gradients — no image downloads, no layout cost, and
 * it scales to any viewport. Text never sits on it directly: every readable
 * surface in the app is a glass panel over the top (see src/index.css).
 */
export function SkyBackground() {
  const [scene, setScene] = useState<Scene>(() => sceneForHour(new Date().getHours()));

  useEffect(() => {
    const update = () => setScene(sceneForHour(new Date().getHours()));
    // Re-check on the hour rather than on a timer that never sleeps.
    const timer = window.setInterval(update, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-scene', scene);
  }, [scene]);

  const stars = useMemo(() => buildStars(), []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Sky gradient */}
      <div
        className="absolute inset-0 transition-[background] duration-1000"
        style={{
          background:
            'linear-gradient(180deg, var(--sky-top) 0%, var(--sky-mid) 45%, var(--sky-low) 78%, var(--sky-horizon) 100%)',
        }}
      />

      {/* Stars, visible only at night */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{ opacity: 'var(--star-opacity)' }}
      >
        {stars.map((star, index) => (
          <span
            key={index}
            className="absolute rounded-full bg-white animate-twinkle"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDelay: `${star.delay}s`,
              opacity: star.opacity,
            }}
          />
        ))}
      </div>

      {/* Sun glow */}
      <div
        className="absolute inset-0 transition-[background] duration-1000"
        style={{
          background:
            'radial-gradient(38rem 30rem at var(--sun-x) var(--sun-y), rgb(var(--sun-color) / 0.55) 0%, rgb(var(--sun-color) / 0.22) 35%, transparent 68%)',
        }}
      />

      {/* Sun rays */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            'conic-gradient(from 200deg at var(--sun-x) var(--sun-y), transparent 0deg, rgb(var(--sun-color) / 0.16) 12deg, transparent 26deg, rgb(var(--sun-color) / 0.12) 42deg, transparent 58deg, rgb(var(--sun-color) / 0.14) 76deg, transparent 92deg)',
          maskImage: 'radial-gradient(60rem 50rem at var(--sun-x) var(--sun-y), black 0%, transparent 72%)',
          WebkitMaskImage:
            'radial-gradient(60rem 50rem at var(--sun-x) var(--sun-y), black 0%, transparent 72%)',
        }}
      />

      {/* Clouds — soft, slow, and never behind body text */}
      <div className="absolute inset-x-0 top-[4%] h-[38rem] animate-drift-slow opacity-90">
        <Cloud className="left-[-8%] top-4 h-44 w-[38rem]" blur={38} />
        <Cloud className="left-[18%] top-24 h-28 w-[22rem]" blur={30} />
        <Cloud className="right-[-6%] top-20 h-56 w-[44rem]" blur={46} />
      </div>
      <div className="absolute inset-x-0 bottom-[4%] h-[30rem] animate-drift opacity-80">
        <Cloud className="left-[8%] bottom-8 h-40 w-[34rem]" blur={36} />
        <Cloud className="right-[4%] bottom-28 h-32 w-[27rem]" blur={32} />
        <Cloud className="left-[42%] bottom-40 h-24 w-[19rem]" blur={26} />
      </div>

      {/* Atmospheric haze at the horizon */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: 'linear-gradient(180deg, transparent 0%, rgb(255 255 255 / 0.14) 100%)' }}
      />
      {/* A very light vignette, just enough to seat the panels */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(130% 100% at 50% 10%, transparent 55%, rgb(6 22 52 / 0.24) 100%)' }}
      />
    </div>
  );
}

function Cloud({ className, blur }: { className: string; blur: number }) {
  return (
    <div
      className={`absolute rounded-full ${className}`}
      style={{
        background:
          'radial-gradient(closest-side, rgb(255 255 255 / 0.95) 0%, rgb(255 255 255 / 0.55) 48%, rgb(255 255 255 / 0.12) 78%, transparent 100%)',
        filter: `blur(${blur}px)`,
      }}
    />
  );
}

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
}

/** A fixed scatter — seeded so the sky does not reshuffle on every render. */
function buildStars(): Star[] {
  const stars: Star[] = [];
  let seed = 20260907;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 70; i += 1) {
    stars.push({
      x: random() * 100,
      y: random() * 68,
      size: 1 + random() * 1.8,
      opacity: 0.35 + random() * 0.5,
      delay: random() * 6,
    });
  }
  return stars;
}
