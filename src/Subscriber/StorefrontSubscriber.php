<?php declare(strict_types=1);

namespace Paul\AiChat\Subscriber;

use Shopware\Core\System\SystemConfig\SystemConfigService;
use Shopware\Storefront\Page\PageLoadedEvent;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Shopware\Core\Framework\Struct\ArrayEntity;

class StorefrontSubscriber implements EventSubscriberInterface
{
    private SystemConfigService $config;

    public function __construct(SystemConfigService $config)
    {
        $this->config = $config;
    }

    public static function getSubscribedEvents(): array
    {
        return [PageLoadedEvent::class => 'onPageLoaded'];
    }

    public function onPageLoaded(PageLoadedEvent $event): void
    {
        $salesChannelId = $event->getSalesChannelContext()->getSalesChannelId();

        $chatUrl         = (string) ($this->config->get('PaulAiChat.config.chatUrl', $salesChannelId) ?? '');
        $welcomeMessage  = (string) ($this->config->get('PaulAiChat.config.welcomeMessage', $salesChannelId) ?? 'Hi! How can we help?');
        $autoOpen        = (bool)   ($this->config->get('PaulAiChat.config.autoOpen', $salesChannelId) ?? false);
        $buttonLabel     = (string) ($this->config->get('PaulAiChat.config.buttonLabel', $salesChannelId) ?? 'Chat');
        $position        = (string) ($this->config->get('PaulAiChat.config.position', $salesChannelId) ?? 'bottom-right');

        $event->getPage()->addExtension('paulAiChat', new ArrayEntity([
            'chatUrl'        => $chatUrl,
            'welcomeMessage' => $welcomeMessage,
            'autoOpen'       => $autoOpen,
            'buttonLabel'    => $buttonLabel,
            'position'       => $position,
        ]));
    }
}
