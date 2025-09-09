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
      <div className={`relative z-10 ${microgramma.className}`}>
        <section className="min-h-screen flex items-center justify-center text-white">
          <motion.h1
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="text-3xl md:text-5xl font-bold whitespace-nowrap"
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