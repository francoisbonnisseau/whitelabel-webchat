// my-webchat-loader.js - À héberger sur votre serveur/CDN
(function() {
    'use strict';

    let config = {};
    let chatIframe = null;
    let fabButton = null;
    let isInitialized = false;
    let chatState = 'closed';
    const chatUiUrl = './chat-ui.html'; // Chemin relatif ou absolu vers votre UI
    const iframeId = 'my-webchat-iframe-container';
    const fabId = 'my-webchat-fab';

    const eventListeners = {};
    const on = (eventName, callback) => {
        if (!eventListeners[eventName]) eventListeners[eventName] = new Set();
        eventListeners[eventName].add(callback);
        return () => eventListeners[eventName]?.delete(callback);
    };
    const emit = (eventName, data) => {
        eventListeners[eventName]?.forEach(callback => callback(data));
    };

    const createChatIframe = () => {
        if (document.getElementById(iframeId)) return;

        chatIframe = document.createElement('iframe');
        chatIframe.id = iframeId;
        chatIframe.title = config.title || 'Chat Widget';
        chatIframe.style.display = 'none'; // Caché initialement par style CSS aussi
        chatIframe.setAttribute('frameborder', '0');
        chatIframe.src = chatUiUrl; // Charger l'UI

        // Envoyer la config une fois l'iframe chargée
        chatIframe.onload = () => {
            sendMessageToIframe({ type: 'init-config', payload: config });
        };

        document.body.appendChild(chatIframe);
    };

    const createFab = () => {
        if (document.getElementById(fabId)) return;

        fabButton = document.createElement('button');
        fabButton.id = fabId;
        fabButton.setAttribute('aria-label', 'Ouvrir le chat');
        fabButton.setAttribute('aria-expanded', 'false');
        fabButton.innerHTML = '->💬<-'; // Icône simple
        fabButton.onclick = toggleChat;

        document.body.appendChild(fabButton);
    };

     const injectStyles = () => {
        const styleTag = document.createElement('style');
        styleTag.id = 'my-webchat-styles';
        styleTag.textContent = `
            #${fabId} {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background-color: ${config.themeColor || '#007bff'};
                color: white;
                border: none;
                cursor: pointer;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                z-index: 9998;
                transition: transform 0.2s ease;
            }
            #${fabId}:hover {
                 transform: scale(1.1);
            }
            #${iframeId} {
                position: fixed;
                z-index: 9999;
                bottom: 90px;
                right: 20px;
                width: 350px;
                height: 500px;
                box-shadow: 0 5px 20px rgba(0,0,0,0.2);
                border-radius: 8px;
                overflow: hidden;
                transition: opacity 0.3s ease, transform 0.3s ease, visibility 0s linear 0.3s;
                opacity: 0;
                transform: translateY(10px);
                visibility: hidden; /* Caché par défaut */
            }
            #${iframeId}.opened {
                opacity: 1;
                transform: translateY(0);
                visibility: visible;
                transition: opacity 0.3s ease, transform 0.3s ease;
            }
        `;
        document.head.appendChild(styleTag);
    };

    const handleIframeMessage = (event) => {
        // IMPORTANT: Ajoutez une vérification d'origine en production !
        // const chatUiOrigin = new URL(chatUiUrl).origin;
        // if (event.origin !== chatUiOrigin) return;

        const message = event.data;
        if (typeof message !== 'object' || !message.type) return;

        if (message.type === 'chat-ui-ready') {
            console.log('Loader: Chat UI est prête.');
            emit('ready');
        }
         if (message.type === 'request-close') {
             closeChat();
         }
    };

    const sendMessageToIframe = (message) => {
        // IMPORTANT: Spécifiez l'origine cible en production !
        chatIframe?.contentWindow?.postMessage(message, '*');
    };

    const updateUiState = () => {
        if (!chatIframe || !fabButton) return;
        if (chatState === 'opened') {
            chatIframe.classList.add('opened');
            fabButton.setAttribute('aria-expanded', 'true');
            // fabButton.innerHTML = '✕'; // Optionnel: changer icône
        } else {
            chatIframe.classList.remove('opened');
            fabButton.setAttribute('aria-expanded', 'false');
             // fabButton.innerHTML = '💬'; // Optionnel: changer icône
        }
    };

    const init = (userConfig = {}) => {
        if (isInitialized) return;
        console.log('myWebchat initialisation avec config:', userConfig);
        config = { ...config, ...userConfig };

        if (!config.webhookId) {
             console.error('myWebchat Erreur: `webhookId` est requis.');
             return;
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupDOM);
        } else {
            setupDOM();
        }
        isInitialized = true;
    };

    const setupDOM = () => {
        if (!document.getElementById('my-webchat-styles')) {
            injectStyles();
        }
        if (!document.getElementById(fabId)) {
            createFab();
        }
        if (!document.getElementById(iframeId)) {
            createChatIframe(); // L'iframe chargera et demandera la config via onload
        }
        window.addEventListener('message', handleIframeMessage);
        updateUiState(); // Appliquer état initial (fermé)
    };

    const openChat = () => {
        if (!isInitialized || chatState === 'opened') return;
        chatState = 'opened';
        updateUiState();
        sendMessageToIframe({ type: 'focus-input' });
        emit('opened');
    };

    const closeChat = () => {
        if (!isInitialized || chatState === 'closed') return;
        chatState = 'closed';
        updateUiState();
        emit('closed');
    };

    const toggleChat = () => chatState === 'opened' ? closeChat() : openChat();

    window.myWebchat = { init, open, close, toggleChat, on };

})();
