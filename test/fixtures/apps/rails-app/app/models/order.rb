class Order < ApplicationRecord
  validates :customer_name, presence: true, length: { maximum: 80 }
  validates :email, presence: true,
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :status, inclusion: { in: %w[draft paid shipped] }
  validates :quantity, numericality: { only_integer: true, greater_than: 0 }
  validates :reference, uniqueness: true
  # validates :legacy, presence: true

  def self.recent
    where(status: "paid").order(:created_at).limit(10)
  end
end
