<?php declare(strict_types=1);

/**
 * Controller to handle contact form submissions for Paul AI Chat.
 *
 * @package    PaulAiChat
 * @author     Paul Nöth
*/

namespace Paul\AiChat\Storefront\Controller;

use Shopware\Core\Framework\Event\EventData\MailRecipientStruct;
use Shopware\Core\Framework\Validation\Exception\ConstraintViolationException;
use Shopware\Core\Content\Mail\Service\MailService;
use Shopware\Core\Framework\Routing\Annotation\RouteScope;
use Shopware\Core\System\SalesChannel\SalesChannelContext;
use Shopware\Core\System\SystemConfig\SystemConfigService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Class FormularController
 *
 * This controller handles the contact form submissions for Paul AI Chat.
 *
 * @author Paul Nöth
 * @package Paul\AiChat\Storefront\Controller
 */
class FormularController extends AbstractController
{
    /**
     * Constructor to initialize the FormularController with necessary services.
     *
     * @param MailService $mailService The mail service used to send emails.
     * @param SystemConfigService $systemConfigService The system configuration service to retrieve settings.
     */
    public function __construct(
        private readonly MailService $mailService,
        private readonly SystemConfigService $systemConfigService,
    ) {}

    #[Route(
        path: '/paul-ai-chat/contact',
        name: 'frontend.paul_ai_chat.contact',
        methods: ['POST'],
        defaults: ['XmlHttpRequest' => true, '_routeScope' => ['storefront']],
    )]

    /**
     * Handles the contact form submission and sends an email.
     *
     * @param Request $request The HTTP request containing form data.
     * @param SalesChannelContext $salesChannelContext The sales channel context.
     * @return JsonResponse A JSON response indicating success or failure.
     */
    public function send(Request $request, SalesChannelContext $salesChannelContext): JsonResponse
    {
        $payload = json_decode((string) $request->getContent(), true);
        if (!\is_array($payload)) {
            $payload = $request->request->all();
        }

        $name    = trim((string)($payload['name'] ?? 'Shop-Kunde'));
        $email   = trim((string)($payload['email'] ?? ''));
        $phone   = trim((string)($payload['phone'] ?? ''));
        $company = trim((string)($payload['company'] ?? ''));
        $message = trim((string)($payload['message'] ?? ''));
        $productRef  = trim((string)($payload['productRef'] ?? ''));
        $quantity    = trim((string)($payload['quantity'] ?? ''));
        $deliveryZip = trim((string)($payload['deliveryZip'] ?? ''));

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return new JsonResponse(['success' => false, 'error' => 'INVALID_EMAIL'], 400);
        }
        if ($message === '') {
            return new JsonResponse(['success' => false, 'error' => 'EMPTY_MESSAGE'], 400);
        }

        $salesChannelId = $salesChannelContext->getSalesChannelId();

        $recipientEmail =
            (string)($this->systemConfigService->get('core.basicInformation.email', $salesChannelId) ?? '');

        if ($recipientEmail === '') {
            $recipientEmail =
                (string)($this->systemConfigService->get('core.mailerSettings.senderAddress', $salesChannelId) ?? '');
        }

        if ($recipientEmail === '' || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
            return new JsonResponse(['success' => false, 'error' => 'NO_RECIPIENT_CONFIGURED'], 500);
        }

        $shopName =
            (string)($this->systemConfigService->get('core.basicInformation.shopName', $salesChannelId) ?? 'Shop');

        $recipients = [$recipientEmail => $shopName];

        $subject = sprintf('Anfrage (PaulAiChat) von %s', $name);

        $metaLines = array_filter([
            "Name: {$name}",
            "E-Mail: {$email}",
            $phone !== '' ? "Telefon: {$phone}" : null,
            $company !== '' ? "Firma: {$company}" : null,
            $productRef !== '' ? "Produkt: {$productRef}" : null,
            $quantity !== '' ? "Menge: {$quantity}" : null,
            $deliveryZip !== '' ? "PLZ: {$deliveryZip}" : null,
        ]);

        $plain = implode("\n", $metaLines) . "\n\nNachricht:\n" . $message;
        $html  = nl2br(htmlspecialchars($plain, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));

        $mailData = [
            'recipients'   => $recipients,
            'senderName'   => $name,
            'senderEmail'  => $email,
            'subject'      => $subject,
            'contentPlain' => $plain,
            'contentHtml'  => $html,
        ];

        try {
            $this->mailService->send($mailData, $salesChannelContext->getContext(), []);
        } catch (ContraintViolationException $e) {
            $out = [];
            foreach ($e->getViolations() as $v) {
                $out[] = [
                    'property' => $v->getPropertyPath(),
                    'message'  => $v->getMessage(),
                ];
            }       
            return new JsonResponse(['success' => false, 'error' => 'VALIDATION', 'violations' => $out], 400);
        }

        return new JsonResponse(['success' => true]);
    }
}
