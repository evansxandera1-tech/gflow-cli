# Mervox Cloud Free

Mervox en la nube sin Termux ni PC encendida. Genera imágenes verticales 9:16 usando Cloudflare Workers AI.

## Motor

- `@cf/black-forest-labs/flux-2-klein-4b`
- 576 × 1024 (9:16)
- soporte opcional de imagen de referencia
- estilo Mervox para animales 3D
- lote de escenas, reintento, aprobación y descarga
- PWA instalable en Android

## Despliegue

Requisitos: una cuenta gratuita de Cloudflare y Node.js en el equipo desde el que se hace el primer despliegue.

```bash
npm install
npx wrangler login
npm run deploy
```

Al terminar, Wrangler muestra una URL `https://mervox-cloud-free.<tu-subdominio>.workers.dev`.
Ábrela desde Android y usa **Añadir a pantalla de inicio**.

## Desarrollo local

```bash
npm install
npm run dev
```

## Nota sobre Google Flow

Este proyecto NO reemplaza Mervox PC. Tu Mervox PC + gflow-cli puede seguir usando Google Flow cuando la PC esté disponible. Mervox Cloud Free es el motor alternativo para usar desde el celular con la PC apagada.
