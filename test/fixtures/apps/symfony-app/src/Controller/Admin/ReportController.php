<?php

namespace App\Controller\Admin;

use Sensio\Bundle\FrameworkExtraBundle\Configuration\IsGranted;
use Sensio\Bundle\FrameworkExtraBundle\Configuration\Security;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

/**
 * The reports of the back office.
 *
 * @Route("/admin/reports")
 * @IsGranted("ROLE_ADMIN")
 */
class ReportController extends AbstractController
{
    /**
     * The monthly report.
     *
     * @Route("/monthly", name="report_monthly", methods={"GET"})
     */
    public function monthly(): Response
    {
        return $this->render('admin/monthly.html.twig');
    }

    /**
     * @Route("/rebuild", methods={"POST"})
     * @Security("is_granted('ROLE_SUPER_ADMIN')")
     */
    public function rebuild(): Response
    {
        return new Response('', 202);
    }

    // @Route("/hidden")
    public function helper(): void
    {
    }
}
