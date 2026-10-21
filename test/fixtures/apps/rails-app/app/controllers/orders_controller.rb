class OrdersController < ApplicationController
  before_action :set_order, only: %i[show update cancel]
  before_action :require_manager, only: [:update, :cancel]
  # before_action :legacy_check

  def index
    @orders = Order.where("customer_name ILIKE ?", "%#{params[:q]}%")
                   .order(created_at: :desc)
                   .page(params[:page]).per(20)
  end

  def show
    authorize @order
  end

  def update
  end

  def cancel
  end

  def export
    @orders = Order.limit(1000)
  end

  private

  def set_order
    @order = Order.find(params[:id])
  end
end
