<h1>Orders</h1>
<p>{{ request()->query('blade_only') }}</p>
@foreach ($orders as $order)
  <p>{{ $order->customer }}</p>
@endforeach
