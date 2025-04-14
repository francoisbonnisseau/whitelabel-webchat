// chat-ui.js - Logique dans l'iframe
import * as chat from 'https://esm.sh/@botpress/chat@latest'; // Import depuis CDN

const chatMessagesContainer = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendButton = document.getElementById('chat-send-button');
const loadingIndicator = document.getElementById('loading-indicator');
const closeButton = document.getElementById('close-button');

let chatConfig = {};
let client = null;
let conversationId = null;
let currentListener = null;
let isConnected = false;
let userId = null;

// --- Initialisation ---
async function initializeChatClient(config) {
    chatConfig = config;
    if (!chatConfig.webhookId) {
        showError("Erreur: webhookId manquant.");
        return;
    }

    showLoading(true);
    console.log('Chat UI: Initialisation du client Botpress...');

    try {
        client = new chat.Client();

        // Essayer de récupérer les infos depuis localStorage
        const storedToken = localStorage.getItem(`bp-chat-token-${chatConfig.webhookId}`);
        const storedConversationId = localStorage.getItem(`bp-chat-conv-${chatConfig.webhookId}`);

        // Connecter avec ou sans token existant
        client = await chat.Client.connect({
            webhookId: chatConfig.webhookId,
            ...(storedToken && { token: storedToken }) // Passe le token s'il existe
        });
        isConnected = true;
        userId = client.user.id; // Récupérer l'ID utilisateur
        console.log('Connecté. User ID:', userId);

        // Sauvegarder le nouveau token (ou le même)
        if (client.config.token) {
             localStorage.setItem(`bp-chat-token-${chatConfig.webhookId}`, client.config.token);
        }


        // Gérer la conversation
        if (storedConversationId) {
             // Optionnel: Valider l'ancienne conversation ? Pour la simplicité, on la réutilise.
            conversationId = storedConversationId;
            console.log('Conversation existante réutilisée:', conversationId);
        } else {
            const { conversation } = await client.createConversation({});
            conversationId = conversation.id;
            localStorage.setItem(`bp-chat-conv-${chatConfig.webhookId}`, conversationId);
            console.log('Nouvelle conversation créée:', conversationId);
        }

        // Charger l'historique
        await loadMessageHistory();

        // Écouter les nouveaux messages
        await setupRealtimeListener();

        enableChatInput();
        notifyLoaderReady(); // Informer le loader que tout est prêt

    } catch (error) {
        console.error("Erreur d'initialisation du client:", error);
        showError("Impossible d'initialiser le chat. Vérifiez la configuration.");
    } finally {
        showLoading(false);
    }
}

// --- Gestion des Messages ---
async function loadMessageHistory() {
    if (!client || !conversationId) return;
    console.log("Chargement de l'historique...");
    try {
        const { messages } = await client.listMessages({ conversationId });
        chatMessagesContainer.innerHTML = ''; // Nettoyer avant d'ajouter
        messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) // Trier au cas où
                 .forEach(renderMessage);
        scrollToBottom();
    } catch (error) {
        console.error("Erreur chargement historique:", error);
        showError("Erreur lors du chargement de l'historique.");
    }
}

function renderMessage(message) {
    const isUser = message.userId === userId;
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'user-message' : 'bot-message'}`;

    // Pour l'instant, on gère seulement le texte
    if (message.payload?.type === 'text') {
        const textP = document.createElement('p');
        textP.textContent = message.payload.text;
        messageDiv.appendChild(textP);
    } else {
        // Fallback pour types non gérés
        const textP = document.createElement('p');
        textP.textContent = `[Message type ${message.payload?.type || 'unknown'}]`;
        messageDiv.appendChild(textP);
    }
    chatMessagesContainer.appendChild(messageDiv);
}

async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text || !client || !conversationId || !isConnected) return;

    // Affichage optimiste
    renderMessage({ userId: userId, payload: { type: 'text', text: text }});
    scrollToBottom();
    const messageToSend = text; // Copier la valeur avant de vider
    chatInput.value = '';

    try {
        await client.createMessage({
            conversationId: conversationId,
            payload: { type: 'text', text: messageToSend },
        });
        console.log('Message envoyé via client.');
    } catch (error) {
        console.error("Erreur d'envoi du message:", error);
        // Afficher l'erreur sur le message optimiste (simplifié ici)
        const lastMsg = chatMessagesContainer.querySelector('.user-message:last-child p');
        if(lastMsg && lastMsg.textContent === messageToSend) {
            lastMsg.textContent += ' (Erreur envoi)';
            lastMsg.style.color = 'red';
        } else {
             showError("Erreur lors de l'envoi du message.");
        }
        chatInput.value = messageToSend; // Remettre le texte dans l'input en cas d'erreur
    }
}

// --- Écoute Temps Réel ---
async function setupRealtimeListener() {
    if (currentListener) currentListener.disconnect(); // Déconnecter l'ancien
    if (!client || !conversationId) return;

    console.log('Écoute de la conversation...');
    try {
        currentListener = await client.listenConversation({ id: conversationId });

        currentListener.on('message_created', (ev) => {
            console.log('Message reçu (SSE):', ev);
             // Vérifier si ce n'est pas notre propre message qui revient
             if (ev.userId !== userId) {
                renderMessage(ev);
                scrollToBottom();
            }
        });

        currentListener.on('error', (err) => {
            console.error('Erreur de connexion temps réel:', err);
            isConnected = false;
            showError("Connexion temps réel perdue. Tentative de reconnexion...");
            // Logique de reconnexion simple
            setTimeout(reconnectListener, 3000); // Essayer de reconnecter après 3s
        });

        isConnected = true; // Marquer comme connecté après setup réussi

    } catch(error) {
        console.error("Impossible d'écouter la conversation:", error);
         showError("Erreur de connexion temps réel.");
         isConnected = false;
    }
}

async function reconnectListener() {
    if (!client || !conversationId) return;
    console.log("Tentative de reconnexion...");
    try {
        // Le client ou le listener peut avoir une méthode connect/reconnect
        // Si listenConversation recrée le listener, il suffit de le rappeler
        await setupRealtimeListener(); // Relance l'écoute
         // Recharger l'historique peut être utile pour récupérer les messages manqués
        await loadMessageHistory();
        showError(""); // Effacer le message d'erreur si succès
        console.log("Reconnecté !");

    } catch (error) {
        console.error("Échec de la reconnexion:", error);
        // Planifier une nouvelle tentative avec backoff exponentiel serait mieux
        setTimeout(reconnectListener, 5000); // Réessayer plus tard
    }
}


// --- Utilitaires UI ---
function showLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'block' : 'none';
    chatInput.disabled = isLoading;
    chatSendButton.disabled = isLoading;
}

function showError(message) {
    console.error("Chat UI Error:", message);
    // Simplifié: pour l'instant on log juste, on pourrait l'afficher dans l'UI
     const errorDiv = document.getElementById('error-message-display'); // Element à ajouter dans chat-ui.html
    if(errorDiv) errorDiv.textContent = message;
}

function enableChatInput() {
     chatInput.disabled = false;
     chatSendButton.disabled = false;
}

function scrollToBottom() {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

// --- Communication avec le Loader ---
function notifyLoaderReady() {
    window.parent.postMessage({ type: 'chat-ui-ready' }, '*'); // Remplacer * par l'origine hôte
}

// Écouter la config du loader
window.addEventListener('message', (event) => {
    // IMPORTANT: Vérifiez event.origin en production!
    if (event.data?.type === 'init-config') {
        initializeChatClient(event.data.payload);
    }
    if (event.data?.type === 'focus-input') {
         chatInput?.focus();
    }
});

// Ajouter les listeners pour l'input et le bouton
chatSendButton.addEventListener('click', handleSendMessage);
chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
    }
});
closeButton?.addEventListener('click', () => {
     window.parent.postMessage({ type: 'request-close' }, '*'); // Demander au loader de fermer
});
