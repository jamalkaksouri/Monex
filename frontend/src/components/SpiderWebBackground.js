import React, { useRef, useEffect } from "react";

const FinanceBackgroundClean = () => {
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const animationId = useRef(null);

  const config = {
    particleCount: 70,
    maxDistance: 160,
    particleRadius: 2,
    speed: 0.25,
    lineWaveAmplitude: 6,
    lineWaveFrequency: 0.002,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize particles
    particles.current = Array.from(
      { length: config.particleCount },
      (_, i) => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * config.speed,
        vy: (Math.random() - 0.5) * config.speed,
        radius: Math.random() * config.particleRadius + 1,
        offset: Math.random() * 1000,
      })
    );

    let time = 0;

    const animate = () => {
      time += 1;

      // Clear canvas completely
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw gradient background
      const gradient = ctx.createLinearGradient(
        0,
        0,
        canvas.width,
        canvas.height
      );
      gradient.addColorStop(0, "#0a1628");
      gradient.addColorStop(0.5, "#142847");
      gradient.addColorStop(1, "#0f1e3c");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update and draw particles
      particles.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Particle glow using radial gradient
        const radGrad = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          p.radius * 3
        );
        radGrad.addColorStop(0, "rgba(24,255,255,0.8)");
        radGrad.addColorStop(1, "rgba(24,255,255,0)");
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw connecting lines with subtle wave
      for (let i = 0; i < particles.current.length; i++) {
        for (let j = i + 1; j < particles.current.length; j++) {
          const p1 = particles.current[i];
          const p2 = particles.current[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < config.maxDistance) {
            const wave =
              Math.sin(time * config.lineWaveFrequency + p1.offset) *
              config.lineWaveAmplitude;
            ctx.strokeStyle = `rgba(24,255,255,${
              (1 - dist / config.maxDistance) * 0.25
            })`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y + wave);
            ctx.lineTo(p2.x, p2.y - wave);
            ctx.stroke();
          }
        }
      }

      animationId.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        display: "block",
      }}
    />
  );
};

export default FinanceBackgroundClean;
