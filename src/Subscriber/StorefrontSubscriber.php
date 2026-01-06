<?php declare(strict_types=1);

/**
 * Subscriber to inject Paul AI Chat configuration into storefront pages.
 *
 * @package    PaulAiChat
 * @author     Paul Nöth
*/

namespace Paul\AiChat\Subscriber;

use Shopware\Core\System\SystemConfig\SystemConfigService;
use Shopware\Storefront\Page\PageLoadedEvent;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Shopware\Core\Framework\Struct\ArrayEntity;

/**
 * Class to handle storefront events for Paul AI Chat.
 *
 * This class listens to the PageLoadedEvent and injects the necessary configuration
 * 
 * @author Paul Nöth
 * @package Paul\AiChat\Subscriber
 */
class StorefrontSubscriber implements EventSubscriberInterface
{
    /**
     *  @var SystemConfigService 
     */
    private SystemConfigService $config;

    /**
     * Constructer that initializes the StorefrontSubscriber with the system configuration service.
     * 
     * @param SystemConfigService $config The system configuration service to retrieve plugin settings.
     */
    public function __construct(SystemConfigService $config)
    {
        $this->config = $config;
    }

    /**
     * Returns an array of events this subscriber wants to listen to.
     * 
     * @return array The array of subscribed events.
     */
    public static function getSubscribedEvents(): array
    {
        return [PageLoadedEvent::class => 'onPageLoaded'];
    }

    /**
     * Event handler for the PageLoadedEvent.
     * 
     * This method retrieves the Paul AI Chat configuration settings and adds them
     * as an extension to the loaded page.
     * 
     * @param PageLoadedEvent $event The event object containing page and context information.
     */
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
