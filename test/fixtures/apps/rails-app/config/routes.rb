# Fixture: the routes of the `rails` stack adapter (test/unit/stack-other.test.mjs).
Rails.application.routes.draw do
  root "home#index"
  get "/about", to: "pages#about"
  post "search" => "search#create"
  # get "/legacy", to: "legacy#index"

  resources :orders, only: [:index, :show, :update] do
    resources :items, only: %i[index create]
    member do
      post :cancel
    end
    get :export, on: :collection
  end

  resource :profile, except: [:destroy]

  namespace :admin do
    resources :users,
              only: [:index, :destroy]
    root to: "dashboard#index"
  end

  scope "/api", module: "api" do
    get "status", to: "health#show"
    match "webhooks", to: "webhooks#receive", via: [:get, :post]
  end

  authenticate :user, ->(user) { user.admin? } do
    mount Sidekiq::Web => "/sidekiq"
  end
end
