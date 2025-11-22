import React, { useEffect, useRef } from "react";

const SpiderWebBackground = () => {
    const canvasRef = useRef(null);
    const mousePos = useRef({ x: 0, y: 0 });
    const particles = useRef([]);
    const animationId = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particleCount = 100;
        const connectionDistance = 200;

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.originalX = this.x;
                this.originalY = this.y;
                this.vx = (Math.random() - 0.5) * 0.8;
                this.vy = (Math.random() - 0.5) * 0.8;
                this.radius = Math.random() * 2.5 + 1;
                this.mass = this.radius;
            }

            update(mouseX, mouseY) {
                // Slight drift motion
                this.x += this.vx * 0.3;
                this.y += this.vy * 0.3;

                // Slowly return to original position (elasticity)
                this.x += (this.originalX - this.x) * 0.015;
                this.y += (this.originalY - this.y) * 0.015;

                // Mouse repulsion effect (stronger)
                const dx = this.x - mouseX;
                const dy = this.y - mouseY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const repelDistance = 150;

                if (distance < repelDistance && distance > 0) {
                    const angle = Math.atan2(dy, dx);
                    const force = (1 - distance / repelDistance) * 8;
                    this.x += Math.cos(angle) * force;
                    this.y += Math.sin(angle) * force;
                }

                // Wrap around edges smoothly
                if (this.x < -10) this.x = canvas.width + 10;
                if (this.x > canvas.width + 10) this.x = -10;
                if (this.y < -10) this.y = canvas.height + 10;
                if (this.y > canvas.height + 10) this.y = -10;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(24, 144, 255, 0.9)`;
                ctx.fill();

                // Glow effect
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(24, 144, 255, 0.2)`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // Initialize particles
        particles.current = [];
        for (let i = 0; i < particleCount; i++) {
            particles.current.push(new Particle());
        }

        // Draw web connections
        const drawConnections = () => {
            const lines = [];

            // Find all connections
            for (let i = 0; i < particles.current.length; i++) {
                for (let j = i + 1; j < particles.current.length; j++) {
                    const p1 = particles.current[i];
                    const p2 = particles.current[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < connectionDistance) {
                        lines.push({
                            p1,
                            p2,
                            distance,
                            opacity: 1 - distance / connectionDistance,
                        });
                    }
                }
            }

            // Draw lines with opacity based on distance
            lines.forEach(({ p1, p2, opacity }) => {
                ctx.strokeStyle = `rgba(24, 144, 255, ${opacity * 0.6})`;
                ctx.lineWidth = Math.max(0.5, opacity * 1.5);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            });
        };

        // Main animation loop
        const animate = () => {
            // Create motion blur effect
            ctx.fillStyle = "rgba(15, 30, 60, 0.05)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Update and draw particles
            particles.current.forEach((p) => {
                p.update(mousePos.current.x, mousePos.current.y);
                p.draw();
            });

            // Draw web connections
            drawConnections();

            animationId.current = requestAnimationFrame(animate);
        };

        // Mouse tracking
        const handleMouseMove = (e) => {
            mousePos.current.x = e.clientX;
            mousePos.current.y = e.clientY;
        };

        // Window resize handler
        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        // Event listeners
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("resize", handleResize);

        // Start animation
        animate();

        // Cleanup
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("resize", handleResize);
            if (animationId.current) {
                cancelAnimationFrame(animationId.current);
            }
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
                background: "linear-gradient(135deg, #0a1628 0%, #142847 50%, #0f1e3c 100%)",
                display: "block",
            }}
        />
    );
};
export default SpiderWebBackground;