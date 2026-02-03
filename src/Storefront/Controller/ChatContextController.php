<?php declare(strict_types=1);

/**
 * Controller to provide chat context token for Paul AI Chat.
 *
 * @package    PaulAiChat
 * @author     Paul Nöth
*/

namespace Paul\AiChat\Storefront\Controller;

use Shopware\Storefront\Controller\StorefrontController;
use Shopware\Core\System\SalesChannel\SalesChannelContext;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;


/**
 * Class ChatContextController
 *
 * This controller provides an endpoint to generate a context token for the Paul AI Chat.
 * The token is a JWT that includes information about the customer and sales channel.
 *
 * @author Paul Nöth
 * @package Paul\AiChat\Storefront\Controller
 */
class ChatContextController extends StorefrontController
{
    /**
     * Constructor to initialize the ChatContextController with necessary dependencies.
     *
     * @param string $chatAuthSecret The secret key used to sign the JWT tokens.
     */
    public function __construct(private readonly string $chatAuthSecret)
    {
    }

    #[Route(
        path: '/paul-ai-chat/context-token',
        name: 'frontend.paul_ai_chat.context_token',
        defaults: ['_routeScope' => ['storefront']],
        methods: ['GET']
    )]

    /**
     * Generates and returns a context token for the Paul AI Chat.
     * 
     * @param SalesChannelContext $context The sales channel context containing customer and sales channel information.
     * @return JsonResponse A JSON response containing the generated context token.
     */
    public function contextToken(SalesChannelContext $context): JsonResponse
    {
        // Secret shared with Python backend (set it as env var in Shopware container)
        $secret = $this->chatAuthSecret;
        if ($secret === '') {
            return new JsonResponse(['error' => 'CHAT_AUTH_SECRET not configured'], 500);
        }

        $customer = $context->getCustomer();
        $loggedIn = $customer !== null;

        $payload = [
            'sub' => $loggedIn ? $customer->getId() : null,
            'loggedIn' => $loggedIn,
            'salesChannelId' => $context->getSalesChannelId(),
            'exp' => time() + 60, // 60s validity (short-lived)
        ];

        $token = $this->signToken($payload, $secret);

        return new JsonResponse(['token' => $token]);
    }

    /**
     * Signs the given payload to create a JWT token.
     *
     * @param array $payload The payload data to include in the token.
     * @param string $secret The secret key used to sign the token.
     * @return string The signed JWT token.
     */
    private function signToken(array $payload, string $secret): string
    {
        $header = ['alg' => 'HS256', 'typ' => 'JWT'];

        $h = $this->base64UrlEncode(json_encode($header, JSON_UNESCAPED_SLASHES));
        $p = $this->base64UrlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES));

        $sig = hash_hmac('sha256', $h . '.' . $p, $secret, true);
        $s = $this->base64UrlEncode($sig);

        return $h . '.' . $p . '.' . $s;
    }

    /**
     * Encodes data with base64 URL-safe encoding.
     *
     * @param string $data The data to encode.
     * @return string The base64 URL-encoded string.
     */
    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
