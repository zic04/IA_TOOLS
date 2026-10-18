<?php

namespace App\Controller;

use App\Repository\OrderRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/orders', name: 'order_')]
#[IsGranted('ROLE_USER')]
class OrderController extends AbstractController
{
    #[Route('', name: 'index', methods: ['GET'])]
    public function index(Request $request, OrderRepository $orders): Response
    {
        $q = $request->query->get('q');
        $page = $request->query->getInt('page', 1);

        return $this->render('order/index.html.twig', ['orders' => $orders->search($q, $page)]);
    }

    #[Route('/{id}', name: 'show', methods: ['GET', 'HEAD'])]
    public function show(int $id): Response
    {
        return $this->render('order/show.html.twig', ['id' => $id]);
    }

    #[Route('/{id}/edit', name: 'edit', methods: ['GET', 'POST'])]
    #[IsGranted('ROLE_EDITOR')]
    public function edit(int $id): Response
    {
        return $this->render('order/edit.html.twig', ['id' => $id]);
    }

    #[Route('/{id}', name: 'delete', methods: ['DELETE'])]
    public function delete(int $id): Response
    {
        $this->denyAccessUnlessGranted('ROLE_ADMIN');

        return $this->redirectToRoute('order_index');
    }

    // #[Route('/legacy', name: 'legacy')]
    public function legacy(): Response
    {
        return new Response('gone', 410);
    }

    /*
    #[Route('/old-export', name: 'old_export')]
    */
    #[Route('/export', name: 'export')]
    public function export(#[MapQueryParameter] ?string $format = null): Response
    {
        return new Response($format ?? 'csv');
    }
}
