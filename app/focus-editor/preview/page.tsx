"use client";

// Throwaway: the real home page, with photos (and their unsaved focal points)
// pushed in from /focus-editor through postMessage.
import { useEffect, useState } from "react";
import Home from "../../page";
import { PENROSE_PHOTOS, PenrosePhoto, PenrosePhotosContext } from "../../penrose-photos";

export default function FocusPreview() {
  const [photos, setPhotos] = useState<readonly PenrosePhoto[]>(PENROSE_PHOTOS);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "penrose-photos" && Array.isArray(e.data.photos)) setPhotos(e.data.photos);
    };
    window.addEventListener("message", onMsg);
    window.parent?.postMessage({ type: "penrose-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <PenrosePhotosContext.Provider value={photos}>
      <Home />
    </PenrosePhotosContext.Provider>
  );
}
