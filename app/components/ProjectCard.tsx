import { motion } from "framer-motion";
import { Creepster } from "next/font/google";
import Image from "next/image";
import { useRef } from "react";
import { useNearViewport } from "./useNearViewport";

const drip = Creepster({ weight: "400", subsets: ["latin"] });

interface ProjectCardProps {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
}

export function ProjectCard({ title, description, imageSrc, imageAlt }: ProjectCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref);
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="bg-black bg-opacity-50 backdrop-blur-sm rounded-xl overflow-hidden shadow-2xl shadow-[#ff4fd8]/20 border border-white/10 max-w-4xl w-full"
    >
      {near ? (
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={800}
          height={450}
          className="w-full h-auto object-cover"
        />
      ) : (
        <div ref={ref} className="w-full aspect-[16/9]" />
      )}
      <div className="p-6 md:p-8">
        <h2 className={`text-2xl md:text-4xl mb-4 ${drip.className}`} style={{ color: "#c8f53a", textShadow: "0 0 6px rgba(200,245,58,0.8), 0 0 20px rgba(200,245,58,0.45)" }}>{title}</h2>
        <p className="text-base md:text-lg text-white/80">
          {description}
        </p>
      </div>
    </motion.div>
  );
}