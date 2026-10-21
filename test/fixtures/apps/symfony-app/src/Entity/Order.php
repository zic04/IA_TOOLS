<?php

namespace App\Entity;

use App\Repository\OrderRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: OrderRepository::class)]
class Order
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 80)]
    #[Assert\NotBlank]
    #[Assert\Length(min: 1, max: 80)]
    private string $customer = '';

    #[ORM\Column(length: 180)]
    #[Assert\Email]
    private ?string $email = null;

    #[ORM\Column(length: 20)]
    #[Assert\Choice(['open', 'shipped', 'cancelled'])]
    private string $status = 'open';

    #[ORM\Column]
    #[Assert\Range(min: 1, max: 9)]
    private int $quantity = 1;
}
