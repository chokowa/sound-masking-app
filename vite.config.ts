import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    base: '/sound-masking-app/', // Add this line
    plugins: [
        // VitePWA({...}) 
    ]
});
