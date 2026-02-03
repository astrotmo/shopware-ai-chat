<?php declare(strict_types=1);

namespace Paul\AiChat\Storefront\Controller;

use Shopware\Storefront\Controller\StorefrontController;
use Shopware\Core\System\SalesChannel\SalesChannelContext;
use Shopware\Core\System\SalesChannel\Entity\SalesChannelRepository;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Criteria;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class PricesController extends StorefrontController
{
    public function __construct(
        private readonly SalesChannelRepository $salesChannelProductRepository,
    ) {}

    #[Route(
        path: '/paul-ai-chat/prices',
        name: 'frontend.paul_ai_chat.prices',
        methods: ['POST'],
        defaults: ['XmlHttpRequest' => true, '_routeScope' => ['storefront']],
    )]
    public function prices(Request $request, SalesChannelContext $context): JsonResponse
    {
        if ($context->getCustomer() === null) {
            return new JsonResponse(['error' => 'NOT_LOGGED_IN'], 401);
        }

        $payload = json_decode((string) $request->getContent(), true);
        $ids = $payload['productIds'] ?? null;

        if (!\is_array($ids) || $ids === []) {
            return new JsonResponse(['error' => 'INVALID_PRODUCT_IDS'], 400);
        }

        $criteria = new Criteria($ids);

        // Helpful when debugging rule prices / advanced prices:
        $criteria->addAssociation('prices'); // rule-based advanced prices (if present)
        $criteria->addAssociation('tax');

        $result = $this->salesChannelProductRepository->search($criteria, $context);

        $out = [];
        foreach ($result->getEntities() as $product) {
            $cp = $product->getCalculatedPrice();

            $tiers = [];
            $calculatedPrices = $product->getCalculatedPrices();
            if ($calculatedPrices) {
                foreach ($calculatedPrices as $tierPrice) {
                    $tiers[] = [
                        'unitPrice' => $tierPrice->getUnitPrice(),
                        'totalPrice' => $tierPrice->getTotalPrice(),
                        'quantity' => $tierPrice->getQuantity(),
                        'listPrice' => $tierPrice->getListPrice()?->getPrice(),
                    ];
                }
            }

            $out[$product->getId()] = [
                'name' => $product->getTranslation('name'),
                'calculatedPrice' => [
                    'unitPrice' => $cp?->getUnitPrice(),
                    'totalPrice' => $cp?->getTotalPrice(),
                    'listPrice' => $cp?->getListPrice()?->getPrice(),
                    'regulationPrice' => $cp?->getRegulationPrice()?->getPrice(),
                ],
                'calculatedPrices' => $tiers,     // tiers/advanced
                'hasAdvancedPrices' => $product->getPrices() !== null && $product->getPrices()->count() > 0,
            ];
        }

        $customer = $context->getCustomer();
        $ruleIds = $context->getRuleIds();

        $priceRules = [];
        if ($product->getPrices()) {
            foreach ($product->getPrices() as $ap) {
                $priceRules[] = [
                    'ruleId' => $ap->getRuleId(),
                    'quantityStart' => $ap->getQuantityStart(),
                    'quantityEnd' => $ap->getQuantityEnd(),
                    'price' => $ap->getPrice()?->first()?->getGross(), // depending on tax state
                ];
            }
        }

        return new JsonResponse([
            'prices' => $out,
        ]);
    }
}