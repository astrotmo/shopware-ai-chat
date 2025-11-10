// custom/plugins/PaulAiChat/src/Resources/app/storefront/src/main.js

import AiChatPlugin from './plugin/ai-chat.plugin';

const PluginManager = window.PluginManager;
PluginManager.register('PaulAiChatPlugin', AiChatPlugin, '[paul-ai-chat-root]');
