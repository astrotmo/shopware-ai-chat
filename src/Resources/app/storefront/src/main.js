/**
 * Main JavaScript entry point for the Paul AI Chat plugin.
 * 
 * This file registers the AI chat plugin with the Shopware PluginManager,
 * enabling the chat functionality on storefront pages.
 * 
 * @package    PaulAiChat
 * @author     Paul Nöth
 */

import AiChatPlugin from './plugin/ai-chat.plugin';

const PluginManager = window.PluginManager;
PluginManager.register('PaulAiChatPlugin', AiChatPlugin, '[paul-ai-chat-root]');
