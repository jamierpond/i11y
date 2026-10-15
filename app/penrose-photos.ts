"use client";

import { createContext, useContext } from "react";

// Photos shown in the home page hero (as Penrose-tile regions) and in the
// gallery grid. Add a photo by adding a line. Any count works (1 to 100s):
// they load lazily, a few at a time, into a fixed number of GPU texture slots.
//
// `focus` is the focal point as fractions of the image [x, y] (0,0 = top left).
// Square crops are centred on it, as close as the image edges allow. Edit them
// visually at /focus-editor (dev only), which saves back to this file.
//
// The hero loads small square copies from public/hero/ (made by
// `pnpm hero-photos`, cropped on the focal point); the gallery uses the
// originals. Run it after adding a photo.
export type PenrosePhoto = {
  src: string;
  focus: readonly [number, number];
  noHero?: boolean; // load the original instead of public/hero (editor preview of unsaved focus)
};

export const PENROSE_PHOTOS: readonly PenrosePhoto[] = [
  { src: "/sunset_group_selfie.webp", focus: [0.58, 0.5] },
  { src: "/night_friends_portrait.webp", focus: [0.5, 0.35] },
  { src: "/playa_group_of_five.webp", focus: [0.5, 0.45] },
  { src: "/table_hangout.webp", focus: [0.5, 0.4] },
  { src: "/green_coat_portrait.webp", focus: [0.5, 0.35] },
  { src: "/naughty_stocks.webp", focus: [0.45, 0.4] },
  { src: "/cap_selfie.webp", focus: [0.62, 0.5] },
  { src: "/camp_event_2.webp", focus: [0.6, 0.35] },
  { src: "/dome_climber.webp", focus: [0.5, 0.45] },
  { src: "/camp_illuminaughty_2017.webp", focus: [0.5, 0.6] },
  { src: "/fireworks_man.webp", focus: [0.52, 0.62] },
  { src: "/dscf2086.webp", focus: [0.4, 0.4] },
  { src: "/camp_build.webp", focus: [0.55, 0.45] },
  { src: "/dscf2132.webp", focus: [0.5, 0.4] },
  { src: "/orb_sculpture.webp", focus: [0.5, 0.6] },
  { src: "/container_2.webp", focus: [0.5, 0.45] },
  { src: "/night_playa_crowd.webp", focus: [0.5, 0.5] },
  { src: "/dscf2169.webp", focus: [0.5, 0.5] },
  { src: "/sound_desk.webp", focus: [0.3, 0.3] },
  { src: "/img_4527.webp", focus: [0.5, 0.4] },
  { src: "/dusty_deck_crew.webp", focus: [0.48, 0.45] },
  { src: "/godzilla_bowl.webp", focus: [0.5, 0.55] },
  { src: "/dscf2230.webp", focus: [0.6, 0.35] },
  { src: "/naughtea_dome_1.webp", focus: [0.5, 0.5] },
  { src: "/pizza_party_2.webp", focus: [0.45, 0.4] },
  { src: "/lightpaniting_2.webp", focus: [0.5, 0.45] },
  { src: "/dscf2112.webp", focus: [0.5, 0.7] },
  { src: "/illuminaughty_at_night_6.webp", focus: [0.5, 0.55] },
  { src: "/squarewave_magic_2.webp", focus: [0.42, 0.35] },
  { src: "/img_4492.webp", focus: [0.45, 0.5] },
  { src: "/squarewave_1.webp", focus: [0.62, 0.5] },
];

// Small square copy the hero loads (see scripts/hero-photos.mjs).
export const heroSrc = (src: string) => "/hero/" + src.split("/").pop()!.replace(/\.[^.]+$/, ".webp");

// The hero's first set starts at the top of the list, so these few can be
// preloaded with the page and the hero opens with photos already showing.
export const HERO_PRELOAD = 7;

// Lets the focus editor preview unsaved focal points in the real page.
export const PenrosePhotosContext = createContext<readonly PenrosePhoto[]>(PENROSE_PHOTOS);
export const usePenrosePhotos = () => useContext(PenrosePhotosContext);

// Source rect of a square cover-crop centred on the focal point.
export function focusCrop(w: number, h: number, focus: readonly [number, number]) {
  const s = Math.min(w, h);
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
  return { sx: clamp(focus[0] * w - s / 2, w - s), sy: clamp(focus[1] * h - s / 2, h - s), s };
}
