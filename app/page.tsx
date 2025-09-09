"use client";
import { PenroseScroll } from "./penrose";
import { motion } from "framer-motion";
import localFont from "next/font/local"

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
  return (
    <div className="font-sans bg-transparent">
      <PenroseScroll />
      <div className="relative z-10">
        <section className="min-h-screen flex items-center justify-center text-white">
          <motion.h1
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className={`text-3xl md:text-5xl font-bold whitespace-nowrap ${microgramma.className}`}
          >
            ILLUMINAUGHTY
          </motion.h1>
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
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="bg-black bg-opacity-50 backdrop-blur-sm rounded-xl overflow-hidden shadow-2xl shadow-purple-500/20 border border-white/10 max-w-4xl w-full"
          >
            <img
              src="/frontage.webp"
              alt="The Eye of Providence"
              className="w-full h-auto object-cover"
            />
            <div className="p-6 md:p-8">
              <h2 className={`text-2xl md:text-4xl font-bold mb-4 ${microgramma.className}`}>The Eye of Providence</h2>
              <p className="text-base md:text-lg text-white/80">
                Behold a dazzling LED tower that pierces the twilight with its vibrant, ever-shifting colors. This magnificent structure, a beacon of artistry and innovation, casts a radiant glow upon the desert landscape, its light a mesmerizing dance of technology and imagination.
              </p>
            </div>
          </motion.div>
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
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className="text-xl md:text-3xl max-w-2xl text-center"
          >
            Created with code.
          </motion.p>
        </section>
      </div>
    </div>
  );
}