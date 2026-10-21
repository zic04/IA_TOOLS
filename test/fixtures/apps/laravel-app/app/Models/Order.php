<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $fillable = ['customer', 'quantity', 'status', 'email', 'channel'];
}
