import { motion } from "framer-motion";
import localFont from "next/font/local";

const microgramma = localFont({
  src: [
    {
      path: '../fonts/microgramma-d-extended-bold.otf',
      weight: '400'
    },
  ],
  variable: '--font-poppins'
});

interface ProjectCardProps {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
}

export function ProjectCard({ title, description, imageSrc, imageAlt }: ProjectCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="bg-black bg-opacity-50 backdrop-blur-sm rounded-xl overflow-hidden shadow-2xl shadow-purple-500/20 border border-white/10 max-w-4xl w-full"
    >
      <img
        src={imageSrc}
        alt={imageAlt}
        className="w-full h-auto object-cover"
      />
      <div className="p-6 md:p-8">
        <h2 className={`text-2xl md:text-4xl font-bold mb-4 ${microgramma.className}`}>{title}</h2>
        <p className="text-base md:text-lg text-white/80">
          {description}
        </p>
      </div>
    </motion.div>
  );
}