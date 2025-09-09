"use client";
import { PenroseScroll } from "./penrose";
import { motion } from "framer-motion";
import localFont from "next/font/local";
import { ProjectCard } from "./components/ProjectCard";
import { useState } from "react";

const microgramma = localFont({
  src: [
    {
      path: './fonts/microgramma-d-extended-bold.otf',
      weight: '400'
    },
  ],
  variable: '--font-poppins'
});

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="font-sans bg-transparent">
      <nav className="fixed top-0 left-0 right-0 z-50 p-4">
        {/* Desktop Nav */}
        <div className="hidden md:flex justify-end space-x-8">
          <a href="#gallery" className="text-white hover:text-purple-300 transition-colors">Gallery</a>
          <a href="#camp" className="text-white hover:text-purple-300 transition-colors">Camp With Us</a>
          <a href="#contact" className="text-white hover:text-purple-300 transition-colors">Contact</a>
        </div>

        {/* Mobile Burger Button */}
        <div className="md:hidden flex justify-end">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-white p-2"
          >
            <div className="space-y-1">
              <div className="w-6 h-0.5 bg-white"></div>
              <div className="w-6 h-0.5 bg-white"></div>
              <div className="w-6 h-0.5 bg-white"></div>
            </div>
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-full right-4 bg-black bg-opacity-80 backdrop-blur-sm rounded-lg p-4 space-y-4">
            <a href="#gallery" className="block text-white hover:text-purple-300 transition-colors" onClick={() => setIsMenuOpen(false)}>Gallery</a>
            <a href="#camp" className="block text-white hover:text-purple-300 transition-colors" onClick={() => setIsMenuOpen(false)}>Camp With Us</a>
            <a href="#contact" className="block text-white hover:text-purple-300 transition-colors" onClick={() => setIsMenuOpen(false)}>Contact</a>
          </div>
        )}
      </nav>
      <PenroseScroll />
      <div className="relative z-10">
        <section className="min-h-screen flex flex-col items-center justify-center text-white space-y-12">
          <motion.h1
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className={`text-3xl md:text-5xl font-bold whitespace-nowrap ${microgramma.className} drop-shadow-[0_0_35px_rgba(147,51,234,0.8)] text-shadow-lg text-white`}
            style={{
              textShadow: '0 0 20px rgba(147,51,234,0.8), 0 0 40px rgba(147,51,234,0.6), 0 0 80px rgba(147,51,234,0.4)',
              filter: 'drop-shadow(0 0 15px rgba(147,51,234,0.9))'
            }}
          >
            ILLUMINAUGHTY
          </motion.h1>
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
            <motion.a
              href="/camp-with-us"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.5 }}
              className={`flex-1 text-center text-sm md:text-lg font-bold px-6 py-3 bg-transparent border-2 border-purple-500 rounded-lg hover:bg-purple-500 hover:bg-opacity-20 transition-all cursor-pointer inline-block ${microgramma.className}`}
              style={{
                textShadow: '0 0 20px rgba(147,51,234,0.8), 0 0 40px rgba(147,51,234,0.6), 0 0 80px rgba(147,51,234,0.4)',
                filter: 'drop-shadow(0 0 15px rgba(147,51,234,0.9))',
                boxShadow: '0 0 20px rgba(147,51,234,0.5), 0 0 40px rgba(147,51,234,0.3), inset 0 0 20px rgba(147,51,234,0.1)'
              }}
            >
              JOIN US
            </motion.a>
            <motion.button
              onClick={() => {
                const nextSection = document.querySelector('section:nth-of-type(2)');
                nextSection?.scrollIntoView({ behavior: 'smooth' });
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.7 }}
              className={`flex-1 text-center text-sm md:text-lg font-bold px-6 py-3 bg-transparent border-2 border-white rounded-lg hover:bg-white hover:text-black transition-all cursor-pointer ${microgramma.className}`}
            >
              LEARN MORE
            </motion.button>
          </div>
        </section>
        <section className="min-h-screen flex items-center justify-center text-white p-4">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className="text-xl md:text-3xl max-w-2xl text-center"
          >
            Discover the beauty of generative art.
          </motion.p>
        </section>
        <section className="min-h-screen flex items-center justify-center text-white p-4">
          <ProjectCard
            title="THE EYE OF PROVIDENCE"
            description="Behold a dazzling LED tower that pierces the twilight with its vibrant, ever-shifting colors. This magnificent structure, a beacon of artistry and innovation, casts a radiant glow upon the desert landscape, its light a mesmerizing dance of technology and imagination."
            imageSrc="/frontage.webp"
            imageAlt="The Eye of Providence"
          />
        </section>
        <section className="min-h-screen flex items-center justify-center text-white p-4">
          <ProjectCard
            title="THE WALL"
            description="An enormous tessellation of vibrant Penrose tiles creates an impossibly infinite pattern that defies the eye. Each geometric facet catches and refracts light in brilliant hues of magenta, cyan, and gold, forming a mesmerizing wall of mathematical beauty that stretches beyond comprehension."
            imageSrc="/thewall.webp"
            imageAlt="The Wall - Penrose Tile Installation"
          />
        </section>
        <section className="min-h-screen flex items-center justify-center text-white p-4">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className="text-xl md:text-3xl max-w-2xl text-center"
          >
            An infinite canvas of color and light.
          </motion.p>
        </section>
        <section className="min-h-screen flex items-center justify-center text-white p-4">
          <motion.a
            href="/camp-with-us"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className={`text-xl md:text-3xl max-w-2xl text-center bg-black hover:bg-gray-900 px-8 py-4 rounded-lg font-bold transition-colors cursor-pointer inline-block ${microgramma.className}`}
          >
            JOIN US
          </motion.a>
        </section>
      </div>
    </div>
  );
}