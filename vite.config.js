import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Convierte la web en una app instalable (PWA): genera el manifest y el
    // service worker que hacen que el navegador ofrezca "Instalar" o
    // "Agregar a pantalla de inicio", y que la app abra en pantalla completa
    // (sin la barra del navegador) y funcione un poco offline. No hace falta
    // pasar por Google Play ni la App Store para esto.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Kulto — Camisetas y ropa estampada",
        short_name: "Kulto",
        description: "Camisetas, sudaderas y accesorios sublimados a tu manera.",
        theme_color: "#15131A",
        background_color: "#15131A",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cachea los archivos de la app para que abra rápido y funcione un
        // poco offline; los datos (productos, pedidos, etc.) siguen viniendo
        // siempre de Supabase en vivo, no se cachean.
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
    }),
  ],
  server: {
    watch: {
      // En algunas instalaciones de Windows el watcher nativo de archivos
      // falla con "UNKNOWN"/"errno -4094" por antivirus, backups en segundo
      // plano, etc. Usar polling evita ese error.
      usePolling: true,
    },
  },
});
