<?php

namespace App\Http\Controllers;

use App\Models\Order;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function index(Request $request)
    {
        $q = $request->query('q');
        // ->orderBy('legacy_rank', 'asc')
        $orders = Order::query()
            ->where('customer', 'like', "%{$q}%")
            ->whereIn('status', $request->input('statuses', []))
            ->orderBy('created_at', 'desc')
            ->paginate(15);

        return view('orders.index', compact('orders'));
    }

    public function recent()
    {
        return Order::latest()->take(10)->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'customer' => 'required|string|max:80',
            'quantity' => 'required|integer|between:1,9',
            'status' => 'in:open,shipped',
        ]);

        return Order::create($data);
    }
}
