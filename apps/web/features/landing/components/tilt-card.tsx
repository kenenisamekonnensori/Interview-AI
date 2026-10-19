"use client";

import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  tiltAngle?: number;
  glareOpacity?: number;
}

/**
 * 3D magnetic tilt card with specular surface glare lighting.
 * Reacts to pointer position with dampened spring physics.
 */
export function TiltCard({
  children,
  className = "",
  tiltAngle = 10,
  glareOpacity = 0.15,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Normalized mouse coords (-0.5 to 0.5)
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth spring physics for rotation
  const springConfig = { damping: 25, stiffness: 260 };
  const rotateX = useSpring(
    useTransform(mouseY, [-0.5, 0.5], [tiltAngle, -tiltAngle]),
    springConfig,
  );
  const rotateY = useSpring(
    useTransform(mouseX, [-0.5, 0.5], [-tiltAngle, tiltAngle]),
    springConfig,
  );

  // Glare position in percentages
  const glareX = useTransform(mouseX, [-0.5, 0.5], ["0%", "100%"]);
  const glareY = useTransform(mouseY, [-0.5, 0.5], ["0%", "100%"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseEnter = () => setIsHovered(true);

  const handleMouseLeave = () => {
    setIsHovered(false);
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      className={`relative perspective-[1000px] transition-shadow duration-300 ${className}`}
    >
      {children}

      {/* Dynamic Specular Glare Overlay */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: isHovered ? glareOpacity : 0,
          background: `radial-gradient(400px circle at ${glareX.get()} ${glareY.get()}, rgba(255, 255, 255, 0.8), transparent 70%)`,
        }}
        aria-hidden="true"
      />
    </motion.div>
  );
}
