<?php

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Routing\Attribute\Route;

class OrderControllerTest extends WebTestCase
{
    #[Route('/test-only')]
    public function testIndex(): void
    {
        $client = static::createClient();
        $client->request('GET', '/orders?q=a');
        $this->assertResponseIsSuccessful();
    }
}
