import naive from 'naive-ui';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
// Import styles required by Naive UI
import 'vfonts/FiraCode.css'; // For code blocks
import 'vfonts/Lato.css'; // Or other fonts

import App from './App.vue';

// --- Office Initialization ---
// Ensure Office.js is loaded before trying to use it

Office.onReady((info) => {
    console.log(`Office is ready. Host: ${info.host}, Platform: ${info.platform}`);
    const app = createApp(App);
    const pinia = createPinia();

    app.use(pinia);
    app.use(naive);

    app.mount('#app');
})

