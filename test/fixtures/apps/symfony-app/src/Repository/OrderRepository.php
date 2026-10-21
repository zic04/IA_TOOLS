<?php

namespace App\Repository;

use App\Entity\Order;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class OrderRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Order::class);
    }

    public function search(?string $q, int $page): array
    {
        return $this->createQueryBuilder('o')
            ->andWhere('LOWER(o.customer) LIKE LOWER(:q)')
            ->andWhere('o.status IN (:statuses)')
            ->setParameter('q', '%'.$q.'%')
            ->setParameter('statuses', ['open', 'shipped'])
            ->orderBy('o.createdAt', 'DESC')
            ->setFirstResult(($page - 1) * 20)
            ->setMaxResults(20)
            ->getQuery()
            ->getResult();
    }

    public function latest(): array
    {
        return $this->findBy(['status' => 'open'], ['placedAt' => 'DESC'], 10);
    }
}
